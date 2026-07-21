// Job routes:
//   POST /agent/schedule  { prompt, cron }  → { id, prompt, cron, active, createdAt }
//   GET  /jobs                              → { jobs: [...] }
//   DELETE /jobs/:id                        → { id, deleted: true }
//
// Delete is a hard delete (row removed) + unregister from the scheduler.
// Runs linked to the deleted job keep their history: Prisma's FK is
// `SET NULL ON DELETE`, so the trace stays queryable via /runs.

import type { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { logger } from '../lib/logger.js';
import { isValidCron, type JobScheduler } from '../jobs/scheduler.js';

export const ScheduleBodySchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'prompt is required')
    .max(500, 'prompt must be ≤500 characters'),
  cron: z.string().trim().min(1, 'cron is required').max(120, 'cron string too long'),
});

export type JobRoutesDeps = {
  prisma: PrismaClient;
  scheduler: JobScheduler;
};

export function scheduleHandler(deps: JobRoutesDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const parsed = ScheduleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      res.status(400).json({ error: 'invalid_body', issues });
      return;
    }
    const { prompt, cron: cronExpr } = parsed.data;
    if (!isValidCron(cronExpr)) {
      res.status(400).json({ error: 'invalid_cron', cron: cronExpr });
      return;
    }
    try {
      const job = await deps.prisma.job.create({
        data: { prompt, cron: cronExpr, active: true },
      });
      deps.scheduler.registerJob(job);
      res.status(201).json(serializeJob(job));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('schedule_create_failed', { message });
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

export function listJobsHandler(deps: JobRoutesDeps) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const jobs = await deps.prisma.job.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ jobs: jobs.map(serializeJob) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('jobs_list_failed', { message });
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

export function deleteJobHandler(deps: JobRoutesDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const raw = req.params.id;
    const id = typeof raw === 'string' ? raw : '';
    if (!id) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }
    try {
      const existing = await deps.prisma.job.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      await deps.prisma.job.delete({ where: { id } });
      deps.scheduler.unregisterJob(id);
      res.json({ id, deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('jobs_delete_failed', { id, message });
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

function serializeJob(job: {
  id: string;
  prompt: string;
  cron: string;
  active: boolean;
  createdAt: Date;
}): {
  id: string;
  prompt: string;
  cron: string;
  active: boolean;
  createdAt: string;
} {
  return {
    id: job.id,
    prompt: job.prompt,
    cron: job.cron,
    active: job.active,
    createdAt: job.createdAt.toISOString(),
  };
}
