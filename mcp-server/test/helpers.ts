import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NbaClient } from '../src/lib/nba-client.js';
import type { ClientDeps } from '../src/lib/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REAL_DATA_DIR = path.resolve(HERE, '..', 'data');

export type FetchMatcher = (url: string) => { status?: number; body: unknown } | undefined;

/** Build an NbaClient whose network calls are answered by a user-supplied matcher.
 *  Tests never touch the real internet. */
export function makeClient(matcher: FetchMatcher, overrides: Partial<ClientDeps> = {}): NbaClient {
  const fakeFetch: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    const hit = matcher(url);
    if (!hit) {
      return new Response('not mocked', { status: 599 });
    }
    return new Response(JSON.stringify(hit.body), {
      status: hit.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  return new NbaClient({
    fetch: fakeFetch as typeof globalThis.fetch,
    now: () => 1_700_000_000_000,
    sleep: () => Promise.resolve(),
    dataDir: overrides.dataDir ?? REAL_DATA_DIR,
    balldontlieApiKey: 'test-key',
    ...overrides,
  });
}

/** Convenience: extract the JSON payload from a tool result. */
export function parseText(result: { content: Array<{ type: 'text'; text: string }> }): unknown {
  const chunk = result.content[0];
  if (!chunk) throw new Error('no content in tool result');
  return JSON.parse(chunk.text);
}
