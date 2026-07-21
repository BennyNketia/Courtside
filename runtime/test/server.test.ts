import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/server.js';

// Prisma isn't actually touched on the paths under test (zod 400 exits
// before any DB call), so a bare stub is enough — and keeps tests hermetic.
const prismaStub = {
  run: { create: async () => undefined },
  $disconnect: async () => undefined,
} as unknown as import('@prisma/client').PrismaClient;

const config = loadConfig({
  PORT: '0',
  RATE_LIMIT_MAX: '3',
  RATE_LIMIT_WINDOW_MS: '60000',
} as NodeJS.ProcessEnv);
const { app } = buildApp({ config, prisma: prismaStub });

let baseUrl = '';
let server: ReturnType<typeof app.listen>;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
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

describe('runtime HTTP surface', () => {
  it('GET /health returns ok + mcpUrl', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; name: string; mcpUrl: string };
    expect(body.status).toBe('ok');
    expect(body.name).toBe('courtside-runtime');
    expect(body.mcpUrl).toBe('http://localhost:3001/mcp');
  });

  it('POST /agent/run with missing body returns 400', async () => {
    const res = await fetch(`${baseUrl}/agent/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: Array<{ message: string }> };
    expect(body.error).toBe('invalid_body');
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('POST /agent/run with an empty question returns 400', async () => {
    const res = await fetch(`${baseUrl}/agent/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /agent/run with an over-long question returns 400', async () => {
    const res = await fetch(`${baseUrl}/agent/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'a'.repeat(600) }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /agent/run returns 405', async () => {
    const res = await fetch(`${baseUrl}/agent/run`);
    expect(res.status).toBe(405);
    const body = (await res.json()) as { error: string; allow: string[] };
    expect(body.error).toBe('method_not_allowed');
    expect(body.allow).toContain('POST');
  });

  it('unknown route returns 404 JSON', async () => {
    const res = await fetch(`${baseUrl}/nonsense`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('per-IP rate limit kicks in after RATE_LIMIT_MAX requests within the window', async () => {
    // Fresh app so we start from a clean rate-limit budget (127.0.0.1 in
    // the outer suite has already exhausted its bucket via other tests).
    const rlConfig = loadConfig({
      PORT: '0',
      RATE_LIMIT_MAX: '2',
      RATE_LIMIT_WINDOW_MS: '60000',
    } as NodeJS.ProcessEnv);
    const { app: rlApp } = buildApp({ config: rlConfig, prisma: prismaStub });
    const rlServer = rlApp.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => rlServer.once('listening', () => resolve()));
    try {
      const { port: rlPort } = rlServer.address() as AddressInfo;
      const url = `http://127.0.0.1:${rlPort}/agent/run`;
      for (let i = 0; i < 2; i += 1) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
      }
      const limited = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(limited.status).toBe(429);
      const body = (await limited.json()) as { error: string };
      expect(body.error).toBe('rate_limited');
    } finally {
      await new Promise<void>((resolve) => rlServer.close(() => resolve()));
    }
  });
});
