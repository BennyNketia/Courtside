// Run history — pagination and detail lookup. Seeds three runs + a
// couple of steps and exercises the paginated cursor + detail routes.

import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { createJobScheduler } from '../src/jobs/scheduler.js';
import { buildApp } from '../src/server.js';

const workDir = mkdtempSync(path.join(os.tmpdir(), 'courtside-runs-'));
const dbPath = path.join(workDir, 'runs.db');
process.env.DATABASE_URL = `file:${dbPath}`;

const runtimeDir = path.resolve(__dirname, '..');

beforeAll(() => {
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
    cwd: runtimeDir,
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'pipe',
  });
});

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });

const config = loadConfig({
  PORT: '0',
  RATE_LIMIT_MAX: '100',
  RATE_LIMIT_WINDOW_MS: '60000',
} as NodeJS.ProcessEnv);

const scheduler = createJobScheduler({ config, prisma, runJob: async () => undefined });
const { app } = buildApp({ config, prisma, scheduler });

let baseUrl = '';
let server: ReturnType<typeof app.listen>;

beforeAll(async () => {
  // Seed three runs, oldest → newest so createdAt ordering is deterministic.
  for (let i = 0; i < 3; i += 1) {
    await prisma.run.create({
      data: {
        id: `seed_${i}`,
        question: `q${i}`,
        status: 'completed',
        model: 'gemini-flash',
        tokensIn: 100 + i,
        tokensOut: 50 + i,
        latencyMs: 1000 + i,
        answer: `a${i}`,
        finishedAt: new Date(Date.now() + i),
        steps: {
          create: [
            { idx: 0, type: 'tool_call', name: 't', argsJson: JSON.stringify({ q: i }), latencyMs: 0 },
            { idx: 1, type: 'tool_result', name: 't', resultJson: JSON.stringify({ ok: true, i }), latencyMs: 10 },
          ],
        },
      },
    });
    // Space createdAt so cursor pagination is stable.
    await new Promise((r) => setTimeout(r, 5));
  }
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  scheduler.stopAll();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

describe('runs history API', () => {
  it('GET /runs returns runs newest-first with summary shape', async () => {
    const res = await fetch(`${baseUrl}/runs`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runs: Array<{ id: string; question: string; status: string; model: string; tokensIn: number }>;
      nextCursor: string | null;
    };
    expect(body.runs.length).toBe(3);
    // Newest first — seed_2 was created last.
    expect(body.runs[0].id).toBe('seed_2');
    expect(body.runs[2].id).toBe('seed_0');
    expect(body.runs[0].status).toBe('completed');
    expect(body.runs[0].model).toBe('gemini-flash');
    // The summary should NOT include steps.
    expect((body.runs[0] as unknown as { steps?: unknown }).steps).toBeUndefined();
  });

  it('GET /runs?limit=1 paginates with a cursor', async () => {
    const page1 = (await (await fetch(`${baseUrl}/runs?limit=1`)).json()) as {
      runs: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(page1.runs.length).toBe(1);
    expect(page1.runs[0].id).toBe('seed_2');
    expect(page1.nextCursor).toBeTypeOf('string');

    const page2 = (await (await fetch(
      `${baseUrl}/runs?limit=1&cursor=${encodeURIComponent(page1.nextCursor as string)}`,
    )).json()) as { runs: Array<{ id: string }>; nextCursor: string | null };
    expect(page2.runs.length).toBe(1);
    expect(page2.runs[0].id).toBe('seed_1');

    const page3 = (await (await fetch(
      `${baseUrl}/runs?limit=1&cursor=${encodeURIComponent(page2.nextCursor as string)}`,
    )).json()) as { runs: Array<{ id: string }>; nextCursor: string | null };
    expect(page3.runs.length).toBe(1);
    expect(page3.runs[0].id).toBe('seed_0');
    expect(page3.nextCursor).toBeNull();
  });

  it('GET /runs rejects an out-of-range limit', async () => {
    const res = await fetch(`${baseUrl}/runs?limit=500`);
    expect(res.status).toBe(400);
  });

  it('GET /runs rejects a bogus cursor', async () => {
    const res = await fetch(`${baseUrl}/runs?cursor=not-a-cursor`);
    expect(res.status).toBe(400);
  });

  it('GET /runs/:id returns the full trace including steps', async () => {
    const res = await fetch(`${baseUrl}/runs/seed_1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      run: {
        id: string;
        question: string;
        steps: Array<{ idx: number; type: string; args?: unknown; result?: unknown }>;
      };
    };
    expect(body.run.id).toBe('seed_1');
    expect(body.run.steps).toHaveLength(2);
    expect(body.run.steps[0].idx).toBe(0);
    expect(body.run.steps[0].type).toBe('tool_call');
    // args/result should be parsed back to JSON.
    expect((body.run.steps[0].args as { q: number }).q).toBe(1);
    expect((body.run.steps[1].result as { ok: boolean }).ok).toBe(true);
  });

  it('GET /runs/:id on an unknown id returns 404', async () => {
    const res = await fetch(`${baseUrl}/runs/nope`);
    expect(res.status).toBe(404);
  });
});
