import { describe, expect, it } from 'vitest';

import { NbaClient } from '../src/lib/nba-client.js';

describe('NbaClient', () => {
  it('returns a structured error when the balldontlie API key is missing', async () => {
    const client = new NbaClient({
      fetch: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
      balldontlieApiKey: '',
    });
    const result = await client.balldontlie('/teams', undefined, 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.retryable).toBe(false);
      expect(result.error.error).toContain('BALLDONTLIE_API_KEY');
    }
  });

  it('caches balldontlie responses', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };
    const client = new NbaClient({
      fetch: fakeFetch as typeof globalThis.fetch,
      balldontlieApiKey: 'test',
      sleep: () => Promise.resolve(),
    });
    await client.balldontlie('/teams', undefined, 60_000);
    await client.balldontlie('/teams', undefined, 60_000);
    expect(calls).toBe(1);
    expect(client.stats().cache.hits).toBeGreaterThan(0);
  });

  it('retries on 429 then succeeds', async () => {
    let attempt = 0;
    const fakeFetch: typeof fetch = async () => {
      attempt += 1;
      if (attempt === 1) return new Response('{}', { status: 429 });
      return new Response(JSON.stringify({ data: [{ id: 1 }] }), { status: 200 });
    };
    const client = new NbaClient({
      fetch: fakeFetch as typeof globalThis.fetch,
      balldontlieApiKey: 'test',
      sleep: () => Promise.resolve(),
    });
    const result = await client.balldontlie<{ data: Array<{ id: number }> }>(
      '/teams',
      undefined,
      1000,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.data[0]!.id).toBe(1);
    expect(attempt).toBe(2);
  });

  it('returns a structured error when a seed file is missing', async () => {
    const client = new NbaClient({
      fetch: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
      dataDir: '/definitely/not/a/directory',
      balldontlieApiKey: 'test',
    });
    const result = await client.seed('missing.json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.retryable).toBe(false);
      expect(result.error.source).toBe('seed');
    }
  });
});
