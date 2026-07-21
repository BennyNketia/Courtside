// Assemble the Express app. Kept separate from `index.ts` so tests can spin
// up the app without opening a network port.

import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';

import type { PrismaClient } from '@prisma/client';

import type { RuntimeConfig } from './config.js';
import { logger } from './lib/logger.js';
import { prisma as sharedPrisma } from './lib/prisma.js';
import { agentRunHandler } from './routes/agent.js';

export const PACKAGE_NAME = 'courtside-runtime';
export const PACKAGE_VERSION = '0.1.0';

export type BuildAppOptions = {
  config: RuntimeConfig;
  prisma?: PrismaClient;
};

export function buildApp(opts: BuildAppOptions): { app: Express; prisma: PrismaClient } {
  const app = express();
  const prisma = opts.prisma ?? sharedPrisma;

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
    res.json({
      status: 'ok',
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      time: new Date().toISOString(),
      mcpUrl: opts.config.mcp.serverUrl,
    });
  });

  app.post('/agent/run', perIpLimiter, agentRunHandler({ config: opts.config, prisma }));

  // Explicit 405 rather than a 404 for /agent/run GET/PUT — helps a curl user
  // who forgot -X POST.
  app.all('/agent/run', (_req, res) => {
    res.status(405).json({ error: 'method_not_allowed', allow: ['POST'] });
  });

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

  return { app, prisma };
}
