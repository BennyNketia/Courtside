// POST /agent/run — the streaming ReAct endpoint.
//
// Contract:
//   Request:  JSON { question: string (1..500) }
//   Response: text/event-stream with typed events:
//               event: token          data: { content: string }
//               event: tool_call      data: { callId, name, args }
//               event: tool_result    data: { callId, name, result, ok }
//               event: error          data: { message }
//               event: done           data: { runId, status, model,
//                                              tokensIn, tokensOut, latencyMs }
//
// On failure (MCP down, LLM outage, timeout, iteration cap) the run STILL
// persists to Prisma, the SSE stream still closes cleanly with an `error`
// event followed by `done`, and the service continues serving other traffic.

import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { z } from 'zod';

import type { RuntimeConfig } from '../config.js';
import { logger } from '../lib/logger.js';
import { openSse } from '../lib/sse.js';
import { runAgent, type AgentEvent } from '../agent/agent.js';
import { connectMcp } from '../agent/mcp.js';
import { buildModelProvider } from '../agent/model.js';
import { persistRun } from '../agent/persist.js';

export const AgentRunBodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'question is required')
    .max(500, 'question must be ≤500 characters'),
});

export type AgentRunDeps = {
  config: RuntimeConfig;
  prisma: PrismaClient;
};

export function agentRunHandler(deps: AgentRunDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const parseResult = AgentRunBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      res.status(400).json({ error: 'invalid_body', issues });
      return;
    }
    const { question } = parseResult.data;
    const runId = randomUUID();

    const sse = openSse(res);

    // Client-disconnect abort: LangGraph cancellation cascades through the
    // agent, cuts the LLM/tool calls, and unwinds into our error path.
    const abortController = new AbortController();
    req.on('close', () => abortController.abort(new Error('client aborted')));

    // Buffer events until model/tools boot — clients still get a heartbeat.
    sse.comment(`run ${runId} starting`);

    const emit = (event: Exclude<AgentEvent, { type: 'done' }>): void => {
      sse.event(event.type, event);
    };

    let mcpConnection: Awaited<ReturnType<typeof connectMcp>> | null = null;
    let providerRef: ReturnType<typeof buildModelProvider> | null = null;
    let outcomeStatus: 'completed' | 'error' | 'timeout' | 'max_iterations' = 'error';
    let modelId: string | null = null;
    let tokensIn = 0;
    let tokensOut = 0;
    let latencyMs = 0;

    try {
      providerRef = buildModelProvider(deps.config);
      try {
        mcpConnection = await connectMcp(deps.config);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ type: 'error', message: `mcp_unavailable: ${message}` });
        const trace = fabricateFailureTrace(question, `mcp_unavailable: ${message}`);
        await persistRun(deps.prisma, {
          runId,
          trace,
          provider: providerRef,
        }).catch((e) => logger.error('persist_failed', { runId, message: String(e) }));
        latencyMs = trace.latencyMs;
        sse.event('done', {
          runId,
          status: 'error',
          model: null,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs,
        });
        sse.close();
        return;
      }

      const outcome = await runAgent({
        question,
        runId,
        provider: providerRef,
        tools: mcpConnection.tools,
        config: deps.config,
        emit,
        signal: abortController.signal,
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

      await persistRun(deps.prisma, { runId, trace, provider: providerRef }).catch((e) =>
        logger.error('persist_failed', { runId, message: String(e) }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('agent_run_uncaught', { runId, message });
      emit({ type: 'error', message });
      if (providerRef) {
        const trace = fabricateFailureTrace(question, message);
        await persistRun(deps.prisma, { runId, trace, provider: providerRef }).catch(() => undefined);
      }
    } finally {
      if (mcpConnection) {
        await mcpConnection.close();
      }
    }

    sse.event('done', {
      runId,
      status: outcomeStatus,
      model: modelId,
      tokensIn,
      tokensOut,
      latencyMs,
    });
    sse.close();
  };
}

function fabricateFailureTrace(question: string, message: string): import('../agent/trace.js').Trace {
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
