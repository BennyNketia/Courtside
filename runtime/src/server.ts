// Assemble the Express app. Kept separate from `index.ts` so tests can spin
// up the app without opening a network port.

import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';

import type { PrismaClient } from '@prisma/client';

import type { RuntimeConfig } from './config.js';
import { createJobScheduler, type JobScheduler } from './jobs/scheduler.js';
import { logger } from './lib/logger.js';
import { prisma as sharedPrisma } from './lib/prisma.js';
import { agentRunHandler } from './routes/agent.js';
import { deleteJobHandler, listJobsHandler, scheduleHandler } from './routes/jobs.js';
import { getRunHandler, listRunsHandler } from './routes/runs.js';

export const PACKAGE_NAME = 'courtside-runtime';
export const PACKAGE_VERSION = '0.2.0';

export type BuildAppOptions = {
  config: RuntimeConfig;
  prisma?: PrismaClient;
  /** Optional scheduler override — tests pass a hand-rolled fake. */
  scheduler?: JobScheduler;
};

export type BuiltApp = {
  app: Express;
  prisma: PrismaClient;
  scheduler: JobScheduler;
};

export function buildApp(opts: BuildAppOptions): BuiltApp {
  const app = express();
  const prisma = opts.prisma ?? sharedPrisma;
  const scheduler = opts.scheduler ?? createJobScheduler({ config: opts.config, prisma });

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.use(
    cors({
      origin: opts.config.clientOrigin,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
    }),
  );

  const perIpLimiter = rateLimit({
    windowMs: opts.config.rateLimit.windowMs,
    limit: opts.config.rateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // 429 body is JSON so a browser fetch surface can read `error`.
    message: { error: 'rate_limited', retryAfterMs: opts.config.rateLimit.windowMs },
  });

  app.get('/health', async (_req, res) => {
    // The health surface is intentionally cheap: it doesn't attempt a live
    // MCP handshake (that would create a socket per health check on a
    // free-tier deploy). Instead it reports the *configured* MCP url and
    // whether providers are configured, so a recruiter's first click sees
    // an honest "yes I'm up and here's what I'm pointed at."
    res.json({
      status: 'ok',
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      time: new Date().toISOString(),
      mcpUrl: opts.config.mcp.serverUrl,
      model: {
        primary: opts.config.model.geminiApiKey ? opts.config.model.geminiModel : null,
        fallback: opts.config.model.groqApiKey ? opts.config.model.groqModel : null,
      },
      scheduler: {
        activeJobs: scheduler.activeJobIds().length,
      },
    });
  });

  app.post('/agent/run', perIpLimiter, agentRunHandler({ config: opts.config, prisma }));

  // Explicit 405 rather than a 404 for /agent/run GET/PUT — helps a curl user
  // who forgot -X POST.
  app.all('/agent/run', (_req, res) => {
    res.status(405).json({ error: 'method_not_allowed', allow: ['POST'] });
  });

  app.post('/agent/schedule', scheduleHandler({ prisma, scheduler }));
  app.get('/jobs', listJobsHandler({ prisma, scheduler }));
  app.delete('/jobs/:id', deleteJobHandler({ prisma, scheduler }));

  app.get('/runs', listRunsHandler({ prisma }));
  app.get('/runs/:id', getRunHandler({ prisma }));

  // Fallback JSON 404.
  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Central error handler: never expose stack traces to the client.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('unhandled_error', { message });
      if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
    },
  );

  return { app, prisma, scheduler };
}
