// Minimal SSE writer. We standardize on typed events so the client can
// switch on `event:` without needing to parse `data:` — matches the client
// contract in SPEC.md Tier 2.

import type { Response } from 'express';

export type SseWriter = {
  event: (name: string, data: unknown) => boolean;
  comment: (text: string) => void;
  close: () => void;
  isClosed: () => boolean;
};

export function openSse(res: Response): SseWriter {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disables proxy/nginx buffering — matters on some free-tier deploys.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  return {
    event(name, data) {
      if (closed) return false;
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      // SSE payloads must escape newlines: split into multiple data: lines.
      const dataLines = payload.split('\n').map((l) => `data: ${l}`).join('\n');
      return res.write(`event: ${name}\n${dataLines}\n\n`);
    },
    comment(text) {
      if (closed) return;
      res.write(`: ${text}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      res.end();
    },
    isClosed: () => closed,
  };
}
