// Job API — create / list / delete, plus scheduler wiring. Uses an
// isolated SQLite DB per test file. The scheduler's `runJob` executor is
// overridden with an in-memory counter so we don't actually connect to
// MCP or hit an LLM.

import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { createJobScheduler } from '../src/jobs/scheduler.js';
import { buildApp } from '../src/server.js';

const workDir = mkdtempSync(path.join(os.tmpdir(), 'courtside-jobs-'));
const dbPath = path.join(workDir, 'jobs.db');
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

const fires: string[] = [];
const scheduler = createJobScheduler({
  config,
  prisma,
  runJob: async (job) => {
    fires.push(job.id);
  },
});

const { app } = buildApp({ config, prisma, scheduler });

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

afterAll(async () => {
  scheduler.stopAll();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

describe('jobs API', () => {
  it('POST /agent/schedule creates a job and registers it', async () => {
    const res = await fetch(`${baseUrl}/agent/schedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'nightly recap', cron: '0 12 * * *' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; prompt: string; cron: string; active: boolean };
    expect(body.prompt).toBe('nightly recap');
    expect(body.cron).toBe('0 12 * * *');
    expect(body.active).toBe(true);
    expect(scheduler.activeJobIds()).toContain(body.id);
  });

  it('POST /agent/schedule rejects an invalid cron', async () => {
    const res = await fetch(`${baseUrl}/agent/schedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x', cron: 'not-a-cron' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_cron');
  });

  it('POST /agent/schedule rejects a missing prompt', async () => {
    const res = await fetch(`${baseUrl}/agent/schedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cron: '0 12 * * *' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /jobs lists active jobs newest-first', async () => {
    const res = await fetch(`${baseUrl}/jobs`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: Array<{ id: string; prompt: string; cron: string }> };
    expect(body.jobs.length).toBeGreaterThan(0);
    expect(body.jobs[0].prompt).toBe('nightly recap');
  });

  it('DELETE /jobs/:id removes the job and unregisters it', async () => {
    const listed = (await (await fetch(`${baseUrl}/jobs`)).json()) as { jobs: Array<{ id: string }> };
    const id = listed.jobs[0].id;
    const before = scheduler.activeJobIds().includes(id);
    expect(before).toBe(true);

    const res = await fetch(`${baseUrl}/jobs/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; deleted: boolean };
    expect(body.deleted).toBe(true);
    expect(scheduler.activeJobIds().includes(id)).toBe(false);

    const row = await prisma.job.findUnique({ where: { id } });
    expect(row).toBeNull();
  });

  it('DELETE /jobs/:id on an unknown id returns 404', async () => {
    const res = await fetch(`${baseUrl}/jobs/does-not-exist`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('scheduler.loadFromDb re-arms jobs after a fresh scheduler instance', async () => {
    // Create a job via API, drop the scheduler, then load fresh — the job
    // should re-register from the DB row.
    const created = await fetch(`${baseUrl}/agent/schedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'reload me', cron: '*/5 * * * *' }),
    });
    const { id } = (await created.json()) as { id: string };

    const scheduler2 = createJobScheduler({
      config,
      prisma,
      runJob: async () => undefined,
    });
    const count = await scheduler2.loadFromDb();
    expect(count).toBeGreaterThan(0);
    expect(scheduler2.activeJobIds()).toContain(id);
    scheduler2.stopAll();

    // Clean up so the test file is idempotent.
    await fetch(`${baseUrl}/jobs/${id}`, { method: 'DELETE' });
  });

  it('a scheduled job actually fires (using a fake runJob)', async () => {
    // Register a job that fires every second via the low-level API and
    // wait for the fake runJob to record a fire.
    const job = await prisma.job.create({
      data: { prompt: 'ping', cron: '* * * * * *', active: true },
    });
    scheduler.registerJob(job);
    fires.length = 0;
    await new Promise((r) => setTimeout(r, 1500));
    scheduler.unregisterJob(job.id);
    await prisma.job.delete({ where: { id: job.id } });
    expect(fires).toContain(job.id);
  }, 5_000);
});
