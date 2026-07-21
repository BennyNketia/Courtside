// Convert an in-memory Trace + usage totals into Prisma rows. Uses a nested
// write so a run + all its steps land atomically; if any step insert fails,
// the run row doesn't leak. Called on BOTH success and failure paths.

import type { PrismaClient } from '@prisma/client';

import type { Trace } from './trace.js';
import type { ModelProvider } from './model.js';

export type PersistRunInput = {
  runId: string;
  jobId?: string | null;
  trace: Trace;
  provider: ModelProvider;
};

export async function persistRun(prisma: PrismaClient, input: PersistRunInput): Promise<void> {
  const { runId, jobId, trace, provider } = input;
  const totals = provider.usage.totals();
  const steps = trace.steps.map((s) => ({
    idx: s.idx,
    type: s.type,
    name: s.name ?? null,
    argsJson: s.argsJson ?? null,
    resultJson: s.resultJson ?? null,
    latencyMs: s.latencyMs,
  }));

  const resolvedModel =
    totals.model && totals.model !== 'unknown' ? totals.model : trace.model;

  // Build the create input as a broadly-typed object so Prisma's
  // discriminated-union Create input (which reacts badly to our
  // exactOptionalPropertyTypes setting) accepts nullable fields cleanly.
  const data = {
    id: runId,
    jobId: jobId ?? null,
    question: trace.question,
    status: trace.status === 'running' ? 'error' : trace.status,
    model: resolvedModel,
    tokensIn: totals.in,
    tokensOut: totals.out,
    latencyMs: trace.latencyMs,
    answer: trace.answer,
    error: trace.error,
    finishedAt: trace.finishedAt !== null ? new Date(trace.finishedAt) : null,
    steps: steps.length ? { create: steps } : undefined,
  } as unknown as Parameters<PrismaClient['run']['create']>[0]['data'];

  await prisma.run.create({ data });
}
