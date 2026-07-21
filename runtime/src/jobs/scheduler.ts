// JobScheduler — the runtime's cron surface.
//
// Owns a set of node-cron tasks keyed by job id. When a job fires it calls
// `runOnce` with the job's prompt; the resulting Run is persisted with
// `jobId` linked to the Job. Active jobs are loaded from Prisma at boot so
// a restart re-arms every schedule.
//
// The scheduler NEVER lets one job's failure take down another: every fire
// is wrapped in its own try/catch. `runOnce` itself already tolerates MCP
// outages and LLM errors, so the try/catch is a defensive backstop.

import { randomUUID } from 'node:crypto';

import type { PrismaClient, Job } from '@prisma/client';
import cron, { type ScheduledTask } from 'node-cron';

import type { RuntimeConfig } from '../config.js';
import { logger } from '../lib/logger.js';
import { runOnce } from '../agent/runOnce.js';

export type JobScheduler = {
  registerJob: (job: Job) => void;
  unregisterJob: (jobId: string) => void;
  activeJobIds: () => string[];
  stopAll: () => void;
  loadFromDb: () => Promise<number>;
};

export type JobSchedulerDeps = {
  config: RuntimeConfig;
  prisma: PrismaClient;
  /** Optional injectable executor — tests can pass a fake to avoid MCP/LLM. */
  runJob?: (job: Job) => Promise<void>;
};

export function isValidCron(expr: string): boolean {
  return cron.validate(expr);
}

export function createJobScheduler(deps: JobSchedulerDeps): JobScheduler {
  const tasks = new Map<string, ScheduledTask>();

  const defaultRunJob = async (job: Job): Promise<void> => {
    const runId = randomUUID();
    logger.info('job_fire', { jobId: job.id, runId, cron: job.cron });
    const summary = await runOnce({
      runId,
      question: job.prompt,
      jobId: job.id,
      config: deps.config,
      prisma: deps.prisma,
    });
    logger.info('job_complete', {
      jobId: job.id,
      runId,
      status: summary.status,
      latencyMs: summary.latencyMs,
      model: summary.model,
    });
  };

  const runJob = deps.runJob ?? defaultRunJob;

  const registerJob = (job: Job): void => {
    if (!isValidCron(job.cron)) {
      logger.warn('job_invalid_cron', { jobId: job.id, cron: job.cron });
      return;
    }
    const existing = tasks.get(job.id);
    if (existing) existing.stop();

    const task = cron.schedule(job.cron, async () => {
      // node-cron awaits async task fns (v4). Swallow errors so a rogue
      // job can't crash the process.
      try {
        await runJob(job);
      } catch (err) {
        logger.error('job_fire_failed', {
          jobId: job.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
    tasks.set(job.id, task);
  };

  const unregisterJob = (jobId: string): void => {
    const task = tasks.get(jobId);
    if (!task) return;
    task.stop();
    tasks.delete(jobId);
  };

  const activeJobIds = (): string[] => Array.from(tasks.keys());

  const stopAll = (): void => {
    for (const task of tasks.values()) task.stop();
    tasks.clear();
  };

  const loadFromDb = async (): Promise<number> => {
    const jobs = await deps.prisma.job.findMany({ where: { active: true } });
    for (const j of jobs) registerJob(j);
    return jobs.length;
  };

  return { registerJob, unregisterJob, activeJobIds, stopAll, loadFromDb };
}
