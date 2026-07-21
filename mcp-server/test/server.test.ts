import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NbaClient } from '../src/lib/nba-client.js';
import { buildApp } from '../src/server.js';
import { REAL_DATA_DIR } from './helpers.js';

const client = new NbaClient({
  fetch: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
  balldontlieApiKey: 'test',
  dataDir: REAL_DATA_DIR,
  sleep: () => Promise.resolve(),
});
const { app } = buildApp({ client });

let baseUrl = '';
let server: ReturnType<typeof app.listen>;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    }),
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

describe('mcp-server HTTP transport', () => {
  it('GET /health returns status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; name: string; stats: unknown };
    expect(body.status).toBe('ok');
    expect(body.name).toBe('courtside-mcp-server');
    expect(body.stats).toBeDefined();
  });

  it('GET /mcp is 405 (stateless server)', async () => {
    const res = await fetch(`${baseUrl}/mcp`);
    expect(res.status).toBe(405);
  });

  it('POST /mcp initialize + tools/list returns all 8 tools', async () => {
    const init = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'vitest', version: '0.0.0' },
        },
      }),
    });
    expect(init.status).toBe(200);

    const list = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { result: { tools: Array<{ name: string }> } };
    const names = listBody.result.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'compare_players',
        'get_league_leaders',
        'get_player_season_averages',
        'get_scoreboard',
        'get_standings',
        'get_team',
        'get_team_games',
        'search_players',
      ].sort(),
    );
  });

  it('POST /mcp tools/call executes get_player_season_averages against the real seed', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_player_season_averages', arguments: { player_id: 115, season: 2024 } },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { content: Array<{ text: string }>; structuredContent?: { player?: { name: string } } };
    };
    const chunk = body.result.content[0];
    expect(chunk).toBeDefined();
    const parsed = JSON.parse(chunk!.text) as { player: { name: string } };
    expect(parsed.player.name).toBe('Stephen Curry');
  });
});
