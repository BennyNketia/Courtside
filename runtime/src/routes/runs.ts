// Run history routes:
//   GET /runs?limit&cursor    → { runs: [...summary...], nextCursor }
//   GET /runs/:id             → { run: {..., steps: [{...}, ...]} }
//
// Cursor is the createdAt-DESC + id pair encoded as `${iso}|${id}` so
// pagination is deterministic even when many rows share a timestamp.

import type { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { logger } from '../lib/logger.js';

export type RunsRoutesDeps = {
  prisma: PrismaClient;
};

const LIST_LIMIT_MAX = 50;
const LIST_LIMIT_DEFAULT = 20;

const ListQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : LIST_LIMIT_DEFAULT))
    .refine((n) => Number.isFinite(n) && n >= 1 && n <= LIST_LIMIT_MAX, {
      message: `limit must be 1..${LIST_LIMIT_MAX}`,
    }),
  cursor: z.string().optional(),
});

export function listRunsHandler(deps: RunsRoutesDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      res.status(400).json({ error: 'invalid_query', issues });
      return;
    }
    const { limit, cursor } = parsed.data;

    let cursorFilter: { OR: unknown[] } | undefined;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        res.status(400).json({ error: 'invalid_cursor' });
        return;
      }
      // "less than (createdAt, id)" — sorting newest-first.
      cursorFilter = {
        OR: [
          { createdAt: { lt: decoded.createdAt } },
          {
            AND: [{ createdAt: decoded.createdAt }, { id: { lt: decoded.id } }],
          },
        ],
      };
    }

    try {
      // Fetch one extra row so we can tell whether another page exists.
      const rows = await deps.prisma.run.findMany({
        where: cursorFilter as never,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const tail = page.length > 0 ? page[page.length - 1] : undefined;
      const nextCursor = hasMore && tail
        ? encodeCursor(tail.createdAt, tail.id)
        : null;

      res.json({
        runs: page.map(serializeRunSummary),
        nextCursor,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('runs_list_failed', { message });
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

export function getRunHandler(deps: RunsRoutesDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const raw = req.params.id;
    const id = typeof raw === 'string' ? raw : '';
    if (!id) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    try {
      const run = await deps.prisma.run.findUnique({
        where: { id },
        include: { steps: { orderBy: { idx: 'asc' } } },
      });
      if (!run) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.json({ run: serializeRunDetail(run as RunRow & { steps: StepRow[] }) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('run_get_failed', { id, message });
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

type RunRow = {
  id: string;
  jobId: string | null;
  question: string;
  status: string;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  answer: string | null;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

type StepRow = {
  id: string;
  idx: number;
  type: string;
  name: string | null;
  argsJson: string | null;
  resultJson: string | null;
  latencyMs: number;
};

function serializeRunSummary(r: RunRow): Record<string, unknown> {
  return {
    id: r.id,
    jobId: r.jobId,
    question: r.question,
    status: r.status,
    model: r.model,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    latencyMs: r.latencyMs,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
  };
}

function serializeRunDetail(r: RunRow & { steps: StepRow[] }): Record<string, unknown> {
  return {
    ...serializeRunSummary(r),
    answer: r.answer,
    error: r.error,
    steps: r.steps.map((s) => ({
      id: s.id,
      idx: s.idx,
      type: s.type,
      name: s.name,
      args: parseMaybeJson(s.argsJson),
      result: parseMaybeJson(s.resultJson),
      latencyMs: s.latencyMs,
    })),
  };
}

function parseMaybeJson(s: string | null): unknown {
  if (s === null) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const idx = decoded.lastIndexOf('|');
    if (idx <= 0) return null;
    const iso = decoded.slice(0, idx);
    const id = decoded.slice(idx + 1);
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
