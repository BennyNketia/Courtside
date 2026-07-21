// Runtime entrypoint. Loads env (package-local .env then repo root),
// assembles the Express app, and starts listening. `main` is only invoked
// when this file is the entry — importing the module (from tests or the
// eval harness) does not open a socket.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { logger } from './lib/logger.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(HERE, '..', '.env') });
loadEnv({ path: path.resolve(HERE, '..', '..', '.env') });

import { loadConfig } from './config.js';
import { disconnectPrisma } from './lib/prisma.js';
import { buildApp, PACKAGE_NAME, PACKAGE_VERSION } from './server.js';

export { buildApp, PACKAGE_NAME, PACKAGE_VERSION } from './server.js';
export const name = '@courtside/runtime';

async function main(): Promise<void> {
  const config = loadConfig();
  const { app, scheduler } = buildApp({ config });

  // Boot-time: reload every active job into node-cron. Failures here are
  // logged but not fatal — the service must still serve /health and
  // /agent/run even if the schedule table is empty or unreachable.
  const loaded = await scheduler.loadFromDb().catch((err) => {
    logger.error('scheduler_bootstrap_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return 0;
  });

  const server = app.listen(config.port, () => {
    logger.info('runtime listening', {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      port: config.port,
      mcpUrl: config.mcp.serverUrl,
      clientOrigin: config.clientOrigin,
      activeJobs: loaded,
      endpoints: [
        'POST /agent/run',
        'POST /agent/schedule',
        'GET /jobs',
        'DELETE /jobs/:id',
        'GET /runs',
        'GET /runs/:id',
        'GET /health',
      ],
    });
  });

  server.on('error', (err) => {
    logger.error('http_server_error', { message: err.message });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutting_down', { signal });
    scheduler.stopAll();
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    logger.error('fatal', { message: e instanceof Error ? e.message : String(e) });
    process.exit(1);
  });
}
