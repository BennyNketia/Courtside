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
  const { app } = buildApp({ config });

  const server = app.listen(config.port, () => {
    logger.info('runtime listening', {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      port: config.port,
      mcpUrl: config.mcp.serverUrl,
      clientOrigin: config.clientOrigin,
      endpoints: ['POST /agent/run', 'GET /health'],
    });
  });

  server.on('error', (err) => {
    logger.error('http_server_error', { message: err.message });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutting_down', { signal });
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
