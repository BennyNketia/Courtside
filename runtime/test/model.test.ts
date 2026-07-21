import { describe, expect, it } from 'vitest';

import { UsageBucket, shouldFallback } from '../src/agent/model.js';

describe('shouldFallback', () => {
  it('flags 429 / 5xx / auth errors', () => {
    expect(shouldFallback({ status: 429 })).toBe(true);
    expect(shouldFallback({ status: 503 })).toBe(true);
    expect(shouldFallback({ status: 401 })).toBe(true);
  });
  it('flags quota / rate-limit messages', () => {
    expect(shouldFallback(new Error('quota exhausted'))).toBe(true);
    expect(shouldFallback(new Error('Request had 429'))).toBe(true);
    expect(shouldFallback(new Error('fetch failed: ECONNREFUSED'))).toBe(true);
  });
  it('ignores unrelated errors', () => {
    expect(shouldFallback(new Error('invalid tool argument'))).toBe(false);
    expect(shouldFallback({ status: 400 })).toBe(false);
    expect(shouldFallback(null)).toBe(false);
  });
});

describe('UsageBucket', () => {
  it('accumulates tokens and reports the last model used', () => {
    const bucket = new UsageBucket();
    bucket.record('gemini-2.5-flash', { in: 100, out: 30 });
    bucket.record('llama-3.3-70b-versatile', { in: 50, out: 10 });
    expect(bucket.totals()).toEqual({ model: 'llama-3.3-70b-versatile', in: 150, out: 40 });
    expect(bucket.breakdown()).toHaveLength(2);
  });

  it('reports zeros with an unknown model when empty', () => {
    const bucket = new UsageBucket();
    expect(bucket.totals()).toEqual({ model: 'unknown', in: 0, out: 0 });
  });
});
