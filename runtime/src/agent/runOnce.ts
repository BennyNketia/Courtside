// One-shot agent invocation. Shared between:
//   - the streaming HTTP route (`POST /agent/run`), which forwards each
//     event to an SSE writer as it fires, and
//   - the cron scheduler, which drops events on the floor but still wants
//     the same trace-capture, MCP-failure and persistence semantics.
//
// A "run once" is the whole lifecycle: build the provider, connect MCP,
// run the ReAct agent, close MCP, persist the trace on success AND
// failure. It never throws — callers get a summary shape they can log.

import type { PrismaClient } from '@prisma/client';

import type { RuntimeConfig } from '../config.js';
import { logger } from '../lib/logger.js';

import { runAgent, type AgentEvent } from './agent.js';
import { connectMcp } from './mcp.js';
import { buildModelProvider } from './model.js';
import { persistRun } from './persist.js';
import type { RunStatus, Trace } from './trace.js';

export type RunOnceInput = {
  runId: string;
  question: string;
  jobId?: string | null;
  config: RuntimeConfig;
  prisma: PrismaClient;
  signal?: AbortSignal;
  /** Called for each streamed event. Errors thrown here are swallowed. */
  onEvent?: (event: Exclude<AgentEvent, { type: 'done' }>) => void;
};

export type RunOnceSummary = {
  runId: string;
  status: RunStatus;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  answer: string | null;
  error: string | null;
};

export async function runOnce(input: RunOnceInput): Promise<RunOnceSummary> {
  const { runId, question, jobId, config, prisma, signal, onEvent } = input;

  const safeEmit = (ev: Exclude<AgentEvent, { type: 'done' }>): void => {
    if (!onEvent) return;
    try {
      onEvent(ev);
    } catch (err) {
      logger.warn('run_emit_failed', { runId, message: String(err) });
    }
  };

  let providerRef: ReturnType<typeof buildModelProvider> | null = null;
  let mcpConnection: Awaited<ReturnType<typeof connectMcp>> | null = null;
  let outcomeStatus: RunStatus = 'error';
  let modelId: string | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  let latencyMs = 0;
  let answer: string | null = null;
  let errorMessage: string | null = null;

  try {
    providerRef = buildModelProvider(config);
    try {
      mcpConnection = await connectMcp(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      safeEmit({ type: 'error', message: `mcp_unavailable: ${message}` });
      const trace = fabricateFailureTrace(question, `mcp_unavailable: ${message}`);
      await persistRun(prisma, {
        runId,
        jobId: jobId ?? null,
        trace,
        provider: providerRef,
      }).catch((e) => logger.error('persist_failed', { runId, message: String(e) }));
      return {
        runId,
        status: 'error',
        model: null,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: trace.latencyMs,
        answer: null,
        error: trace.error,
      };
    }

    const outcome = await runAgent({
      question,
      runId,
      provider: providerRef,
      tools: mcpConnection.tools,
      config,
      emit: safeEmit,
      ...(signal ? { signal } : {}),
    });

    const trace = outcome.trace.snapshot(
      providerRef.currentModelId(),
      providerRef.usage.totals().in,
      providerRef.usage.totals().out,
    );

    outcomeStatus = outcome.status;
    modelId = trace.model;
    tokensIn = trace.tokensIn;
    tokensOut = trace.tokensOut;
    latencyMs = trace.latencyMs;
    answer = trace.answer;
    errorMessage = trace.error;

    await persistRun(prisma, {
      runId,
      jobId: jobId ?? null,
      trace,
      provider: providerRef,
    }).catch((e) => logger.error('persist_failed', { runId, message: String(e) }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('run_uncaught', { runId, message });
    safeEmit({ type: 'error', message });
    errorMessage = message;
    if (providerRef) {
      const trace = fabricateFailureTrace(question, message);
      await persistRun(prisma, {
        runId,
        jobId: jobId ?? null,
        trace,
        provider: providerRef,
      }).catch(() => undefined);
      latencyMs = trace.latencyMs;
    }
  } finally {
    if (mcpConnection) {
      await mcpConnection.close();
    }
  }

  return {
    runId,
    status: outcomeStatus,
    model: modelId,
    tokensIn,
    tokensOut,
    latencyMs,
    answer,
    error: errorMessage,
  };
}

function fabricateFailureTrace(question: string, message: string): Trace {
  const now = Date.now();
  return {
    question,
    status: 'error',
    model: null,
    answer: null,
    error: message,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
    startedAt: now,
    finishedAt: now,
    steps: [],
  };
}
