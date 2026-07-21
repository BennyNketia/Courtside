// Client-side surface for the Courtside runtime (Tier 2).
//
// Everything the frontend needs from the agent runtime lives here so the
// URL lookup and typed event shapes are in one place. Vite exposes env
// vars prefixed with VITE_; RUNTIME_URL falls back to localhost so the
// dev experience is zero-config.

import { parseSseStream, type SseFrame } from './sse.js';

export const RUNTIME_URL: string =
  (import.meta.env.VITE_RUNTIME_URL as string | undefined) ?? 'http://localhost:3002';

export type AgentTokenEvent = { type: 'token'; content: string };
export type AgentToolCallEvent = {
  type: 'tool_call';
  callId: string;
  name: string;
  args: unknown;
};
export type AgentToolResultEvent = {
  type: 'tool_result';
  callId: string;
  name: string;
  result: unknown;
  ok: boolean;
};
export type AgentErrorEvent = { type: 'error'; message: string };
export type AgentDoneEvent = {
  type: 'done';
  runId: string;
  status: 'completed' | 'error' | 'timeout' | 'max_iterations';
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
};

export type AgentEvent =
  | AgentTokenEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentErrorEvent
  | AgentDoneEvent;

export type HealthResponse = {
  status: string;
  name: string;
  version: string;
  time: string;
  mcpUrl: string;
  model: { primary: string | null; fallback: string | null };
  scheduler?: { activeJobs: number };
};

/**
 * POST /agent/run and yield typed events as they arrive. The stream lives
 * for the duration of the run; callers should either consume to
 * completion or pass an AbortSignal.
 */
export async function* streamAgent(
  question: string,
  opts: { signal?: AbortSignal; url?: string } = {},
): AsyncGenerator<AgentEvent, void, void> {
  const url = `${opts.url ?? RUNTIME_URL}/agent/run`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ question }),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = typeof body?.error === 'string' ? body.error : JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    yield { type: 'error', message: `http_${res.status}: ${detail}` };
    yield {
      type: 'done',
      runId: '',
      status: 'error',
      model: null,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
    };
    return;
  }

  if (!res.body) {
    yield { type: 'error', message: 'no response body' };
    yield {
      type: 'done',
      runId: '',
      status: 'error',
      model: null,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
    };
    return;
  }

  for await (const frame of parseSseStream(res.body)) {
    const event = frameToAgentEvent(frame);
    if (event) yield event;
  }
}

function frameToAgentEvent(frame: SseFrame): AgentEvent | null {
  const { event, data } = frame;
  if (!event) return null;
  let parsed: unknown = null;
  try {
    parsed = data.length ? JSON.parse(data) : null;
  } catch {
    // Server writes JSON for every typed event we care about. If a frame
    // is malformed, treat it as a soft error rather than crashing the
    // stream.
    return { type: 'error', message: `malformed_frame: ${event}` };
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;
  switch (event) {
    case 'token':
      return { type: 'token', content: (obj['content'] as string) ?? '' };
    case 'tool_call':
      return {
        type: 'tool_call',
        callId: (obj['callId'] as string) ?? '',
        name: (obj['name'] as string) ?? '',
        args: obj['args'] ?? null,
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        callId: (obj['callId'] as string) ?? '',
        name: (obj['name'] as string) ?? '',
        result: obj['result'] ?? null,
        ok: obj['ok'] !== false,
      };
    case 'error':
      return { type: 'error', message: (obj['message'] as string) ?? 'unknown_error' };
    case 'done':
      return {
        type: 'done',
        runId: (obj['runId'] as string) ?? '',
        status: (obj['status'] as AgentDoneEvent['status']) ?? 'error',
        model: (obj['model'] as string | null) ?? null,
        tokensIn: (obj['tokensIn'] as number) ?? 0,
        tokensOut: (obj['tokensOut'] as number) ?? 0,
        latencyMs: (obj['latencyMs'] as number) ?? 0,
      };
    default:
      return null;
  }
}

export async function getHealth(url = RUNTIME_URL): Promise<HealthResponse> {
  const res = await fetch(`${url}/health`, { method: 'GET' });
  if (!res.ok) throw new Error(`health_${res.status}`);
  return (await res.json()) as HealthResponse;
}
