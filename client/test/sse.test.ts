// SSE parser smoke test. Feeds hand-rolled byte chunks (including one
// event split across two chunks — the tricky case for a naive parser)
// and verifies typed frames are recovered correctly.

import { describe, expect, it } from 'vitest';
import { parseSseStream } from '../src/lib/sse';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function collect<T>(gen: AsyncGenerator<T, void, void>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe('parseSseStream', () => {
  it('parses a stream of well-formed events', async () => {
    const stream = streamOf([
      ': server heartbeat\n\n',
      'event: token\n',
      'data: {"content":"Hello"}\n\n',
      'event: tool_call\n',
      'data: {"callId":"c1","name":"search_players","args":{"name":"LeBron"}}\n\n',
      'event: done\n',
      'data: {"runId":"r1","status":"completed","model":"gemini","tokensIn":10,"tokensOut":20,"latencyMs":500}\n\n',
    ]);

    const frames = await collect(parseSseStream(stream));
    expect(frames.map((f) => f.event)).toEqual(['token', 'tool_call', 'done']);
    expect(JSON.parse(frames[0]!.data)).toEqual({ content: 'Hello' });
    expect(JSON.parse(frames[2]!.data)).toEqual({
      runId: 'r1',
      status: 'completed',
      model: 'gemini',
      tokensIn: 10,
      tokensOut: 20,
      latencyMs: 500,
    });
  });

  it('handles an event split across two chunks', async () => {
    const stream = streamOf([
      'event: token\ndata: {"con',
      'tent":"streamy"}\n\n',
    ]);
    const frames = await collect(parseSseStream(stream));
    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0]!.data)).toEqual({ content: 'streamy' });
  });

  it('joins multi-line data with newline and strips a leading space', async () => {
    const stream = streamOf([
      'event: msg\n',
      'data: line1\n',
      'data: line2\n\n',
    ]);
    const frames = await collect(parseSseStream(stream));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.data).toBe('line1\nline2');
  });

  it('supports CRLF line endings', async () => {
    const stream = streamOf(['event: token\r\ndata: {"content":"crlf"}\r\n\r\n']);
    const frames = await collect(parseSseStream(stream));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.event).toBe('token');
    expect(JSON.parse(frames[0]!.data)).toEqual({ content: 'crlf' });
  });

  it('ignores comment lines', async () => {
    const stream = streamOf([': hello\n: keep-alive\nevent: token\ndata: {"content":"ok"}\n\n']);
    const frames = await collect(parseSseStream(stream));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.event).toBe('token');
  });
});
