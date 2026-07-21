// Build a ReAct agent over the MCP-loaded tools and stream its execution,
// emitting typed events to the caller as the loop makes progress. Every
// event fed to the consumer is also appended to the run's TraceRecorder —
// one design, two payoffs (live SSE + persistent trace).
//
// Two hard limits from SPEC / CLAUDE.md are enforced:
//   1. iteration cap (default 8) — free-tier RPM discipline
//   2. wall-clock timeout (default 60s) — protects the client's stream
//
// Provider fallback: if the primary chat model errors mid-stream in a way
// we recognize as retryable (429 / quota / auth / network), and the LLM
// hasn't yet produced any tokens, we tear down the graph and rerun on the
// fallback model. Tokens and steps from the failed attempt are discarded
// so the persisted trace reflects the run that actually answered.

import { AIMessage, AIMessageChunk, isAIMessage, isAIMessageChunk, isToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import type { RuntimeConfig } from '../config.js';
import { logger } from '../lib/logger.js';

import { shouldFallback, type ModelProvider } from './model.js';
import { TraceRecorder, type RunStatus } from './trace.js';

export type AgentEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; callId: string; name: string; args: unknown }
  | { type: 'tool_result'; callId: string; name: string; result: unknown; ok: boolean }
  | { type: 'error'; message: string }
  | { type: 'done'; runId: string };

export type RunAgentInputs = {
  question: string;
  runId: string;
  provider: ModelProvider;
  tools: DynamicStructuredTool[];
  config: RuntimeConfig;
  emit: (event: Exclude<AgentEvent, { type: 'done' }>) => void;
  signal?: AbortSignal;
};

export type RunAgentOutcome = {
  status: RunStatus;
  answer: string | null;
  error: string | null;
  trace: TraceRecorder;
};

const SYSTEM_PROMPT = [
  'You are Courtside, an NBA analytics agent.',
  '',
  'Tool-use rules (these save free-tier tokens and matter):',
  '- Resolve any player name to an id via `search_players` BEFORE calling stat tools.',
  '- To compare 2–4 players in one season, prefer `compare_players` over multiple `get_player_season_averages` calls.',
  '- Tools may return `{ error, retryable }` — if retryable is false, do NOT retry; incorporate the failure into your answer.',
  '- Prefer 1–2 well-chosen tool calls over exploring. You have a hard cap on iterations.',
  '- Cite `seededAt` when reporting season averages or leaders so freshness is honest.',
  '',
  'Answer format: a single, concise paragraph (or short bullet list) grounded in tool results. If you cannot answer from the tools, say so.',
].join('\n');

export async function runAgent(inputs: RunAgentInputs): Promise<RunAgentOutcome> {
  const { question, provider, tools, config, emit, signal } = inputs;

  const attempt = async (llm: BaseChatModel, modelLabel: string): Promise<RunAgentOutcome> => {
    const trace = new TraceRecorder(question);
    const controller = new AbortController();
    const onClientAbort = () => controller.abort(new Error('client aborted'));
    if (signal) {
      if (signal.aborted) controller.abort(new Error('client aborted'));
      else signal.addEventListener('abort', onClientAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(new Error('timeout')), config.agent.timeoutMs);

    const agent = createReactAgent({
      llm,
      tools,
      prompt: SYSTEM_PROMPT,
    });

    const emittedToolCalls = new Set<string>();
    const toolCallNames = new Map<string, string>();
    const seenToolResults = new Set<string>();
    let answer: string | null = null;
    let status: RunStatus = 'completed';
    let errorMessage: string | null = null;
    let sawStreamedToken = false;

    try {
      const stream = await agent.stream(
        { messages: [{ role: 'user', content: question }] },
        {
          // Each ReAct iteration is agent-node + tool-node = 2 graph steps;
          // add a small buffer so LangGraph's own entry/exit nodes fit.
          recursionLimit: config.agent.maxIterations * 2 + 2,
          streamMode: ['messages', 'values'],
          signal: controller.signal,
        },
      );

      for await (const chunk of stream) {
        if (!Array.isArray(chunk)) continue;
        const [mode, payload] = chunk as [string, unknown];

        if (mode === 'messages') {
          const [msgChunk] = payload as [unknown, unknown];
          if (msgChunk && isAIMessageChunk(msgChunk as never)) {
            const text = readTextContent(msgChunk as AIMessageChunk);
            if (text) {
              sawStreamedToken = true;
              emit({ type: 'token', content: text });
            }
          }
          continue;
        }

        if (mode === 'values') {
          const state = payload as { messages?: BaseMessage[] };
          const messages = state.messages ?? [];
          for (const m of messages) {
            if (isAIMessage(m)) {
              const calls = (m as AIMessage).tool_calls ?? [];
              for (const c of calls) {
                const callId = c.id;
                if (!callId || emittedToolCalls.has(callId)) continue;
                emittedToolCalls.add(callId);
                toolCallNames.set(callId, c.name);
                trace.addToolCall(callId, c.name, c.args);
                emit({ type: 'tool_call', callId, name: c.name, args: c.args });
              }
            } else if (isToolMessage(m)) {
              const callId = m.tool_call_id;
              if (!callId || seenToolResults.has(callId)) continue;
              seenToolResults.add(callId);
              const name = toolCallNames.get(callId) ?? m.name ?? 'tool';
              const parsed = parseToolResultContent(readTextContent(m));
              const status = (m as { status?: string }).status;
              const ok = !status || status !== 'error';
              trace.addToolResult(callId, name, parsed);
              emit({ type: 'tool_result', callId, name, result: parsed, ok });
            }
          }
          const last = messages[messages.length - 1];
          if (last && isAIMessage(last)) {
            const text = readTextContent(last);
            if (text) answer = text;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (controller.signal.aborted && /timeout/i.test(message)) {
        status = 'timeout';
        errorMessage = `agent exceeded ${config.agent.timeoutMs}ms wall-clock`;
      } else if (/recursion|graph recursion limit/i.test(message)) {
        status = 'max_iterations';
        errorMessage = `agent hit max_iterations=${config.agent.maxIterations}`;
      } else {
        status = 'error';
        errorMessage = message;
      }
      // Rethrow so the outer caller can decide whether to try the fallback.
      // We annotate the thrown error with the trace shape so the outer
      // caller can salvage the partial trace on the terminal failure.
      const boxed = new AgentAttemptError(err, {
        status,
        answer,
        error: errorMessage,
        trace,
        sawStreamedToken,
        modelLabel,
      });
      throw boxed;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onClientAbort);
    }

    trace.finish({ status, answer, error: errorMessage });
    return { status, answer, error: errorMessage, trace };
  };

  // First attempt: primary model.
  try {
    return await attempt(provider.primary, provider.primaryId);
  } catch (err) {
    const attemptErr = err instanceof AgentAttemptError ? err : null;
    const raw = attemptErr ? attemptErr.original : err;

    // Only try the fallback when: we have a fallback, we haven't already
    // shown the client any streamed token from the primary (otherwise the
    // client would see a jarring second stream), and the error looks
    // retryable at the provider level.
    if (
      attemptErr &&
      provider.fallback &&
      !attemptErr.partial.sawStreamedToken &&
      shouldFallback(raw)
    ) {
      logger.warn('model_fallback', {
        from: provider.primaryId,
        to: provider.fallbackId,
        reason: raw instanceof Error ? raw.message : String(raw),
      });
      provider.markUsingFallback();
      try {
        return await attempt(provider.fallback, provider.fallbackId ?? 'fallback');
      } catch (err2) {
        if (err2 instanceof AgentAttemptError) return finalizeAttemptError(err2, emit);
        throw err2;
      }
    }

    if (attemptErr) return finalizeAttemptError(attemptErr, emit);
    throw err;
  }
}

class AgentAttemptError extends Error {
  constructor(
    public readonly original: unknown,
    public readonly partial: {
      status: RunStatus;
      answer: string | null;
      error: string | null;
      trace: TraceRecorder;
      sawStreamedToken: boolean;
      modelLabel: string;
    },
  ) {
    super(original instanceof Error ? original.message : String(original));
    this.name = 'AgentAttemptError';
  }
}

function finalizeAttemptError(
  err: AgentAttemptError,
  emit: RunAgentInputs['emit'],
): RunAgentOutcome {
  const { status, answer, error, trace } = err.partial;
  const message = error ?? (err.original instanceof Error ? err.original.message : String(err.original));
  emit({ type: 'error', message });
  trace.finish({ status, answer, error: message });
  logger.warn('agent_run_failed', { status, message });
  return { status, answer, error: message, trace };
}

function readTextContent(m: BaseMessage | AIMessageChunk): string {
  const content = m.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    let acc = '';
    for (const c of content) {
      if (typeof c === 'string') acc += c;
      else if (c && typeof c === 'object' && 'type' in c && (c as { type: string }).type === 'text' && typeof (c as { text?: unknown }).text === 'string') {
        acc += (c as { text: string }).text;
      }
    }
    return acc;
  }
  return '';
}

function parseToolResultContent(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
