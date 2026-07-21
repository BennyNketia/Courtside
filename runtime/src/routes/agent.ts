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
import { openSse } from '../lib/sse.js';
import { runOnce } from '../agent/runOnce.js';

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

    const summary = await runOnce({
      runId,
      question,
      config: deps.config,
      prisma: deps.prisma,
      signal: abortController.signal,
      onEvent: (event) => sse.event(event.type, event),
    });

    sse.event('done', {
      runId: summary.runId,
      status: summary.status,
      model: summary.model,
      tokensIn: summary.tokensIn,
      tokensOut: summary.tokensOut,
      latencyMs: summary.latencyMs,
    });
    sse.close();
  };
}
