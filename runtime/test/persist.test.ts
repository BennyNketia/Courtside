import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UsageBucket } from '../src/agent/model.js';
import { persistRun } from '../src/agent/persist.js';
import { TraceRecorder } from '../src/agent/trace.js';

// Spin up an isolated SQLite database per run so tests don't step on the
// dev.db checked into the developer's local sandbox.
const workDir = mkdtempSync(path.join(os.tmpdir(), 'courtside-runtime-'));
const dbPath = path.join(workDir, 'test.db');
process.env.DATABASE_URL = `file:${dbPath}`;

const runtimeDir = path.resolve(__dirname, '..');

// deploy the current schema into the temp DB before importing PrismaClient.
beforeAll(() => {
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
    cwd: runtimeDir,
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'pipe',
  });
});

// Import after the env var is set so the client picks it up.
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });

afterAll(async () => {
  await prisma.$disconnect();
});

describe('persistRun', () => {
  it('writes a successful run + all its steps', async () => {
    const trace = new TraceRecorder('who leads assists?');
    trace.addToolCall('c1', 'get_league_leaders', { stat: 'ast', season: 2024 });
    trace.addToolResult('c1', 'get_league_leaders', { leaders: [{ name: 'Y', ast: 10 }] });
    trace.finish({ status: 'completed', answer: 'Y leads with 10 apg.' });

    const provider = { usage: new UsageBucket(), currentModelId: () => 'gemini-2.5-flash', model: {} as never };
    provider.usage.record('gemini-2.5-flash', { in: 42, out: 15 });
    const snap = trace.snapshot('gemini-2.5-flash', 42, 15);

    await persistRun(prisma, { runId: 'run_ok_1', trace: snap, provider });

    const run = await prisma.run.findUnique({ where: { id: 'run_ok_1' }, include: { steps: true } });
    expect(run).toBeDefined();
    expect(run!.status).toBe('completed');
    expect(run!.model).toBe('gemini-2.5-flash');
    expect(run!.tokensIn).toBe(42);
    expect(run!.tokensOut).toBe(15);
    expect(run!.answer).toBe('Y leads with 10 apg.');
    expect(run!.steps).toHaveLength(2);
    expect(run!.steps.map((s: { idx: number }) => s.idx).sort()).toEqual([0, 1]);
  });

  it('writes a failed run with error string and partial steps', async () => {
    const trace = new TraceRecorder('who wins tonight?');
    trace.addToolCall('c1', 'get_scoreboard', { date: '2025-11-15' });
    trace.finish({ status: 'error', error: 'mcp_unavailable: fetch failed' });
    const provider = { usage: new UsageBucket(), currentModelId: () => 'unknown', model: {} as never };
    const snap = trace.snapshot(null, 0, 0);

    await persistRun(prisma, { runId: 'run_fail_1', trace: snap, provider });

    const run = await prisma.run.findUnique({ where: { id: 'run_fail_1' }, include: { steps: true } });
    expect(run).toBeDefined();
    expect(run!.status).toBe('error');
    expect(run!.error).toMatch(/mcp_unavailable/);
    expect(run!.answer).toBeNull();
    expect(run!.steps).toHaveLength(1);
    expect(run!.steps[0]!.type).toBe('tool_call');
  });
});
