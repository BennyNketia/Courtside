import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { logger } from './lib/logger.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Load package-local .env first, then fall back to repo root.
loadEnv({ path: path.resolve(HERE, '..', '.env') });
loadEnv({ path: path.resolve(HERE, '..', '..', '.env') });

import { NbaClient } from './lib/nba-client.js';
import { buildApp, PACKAGE_NAME, PACKAGE_VERSION } from './server.js';

export { buildApp, buildMcpServer, PACKAGE_NAME, PACKAGE_VERSION } from './server.js';
export const name = `@courtside/mcp-server`;

async function main(): Promise<void> {
  const port = Number.parseInt(process.env.MCP_PORT ?? '3001', 10);
  const client = new NbaClient();
  const { app } = buildApp({ client });

  const server = app.listen(port, () => {
    logger.info('mcp-server listening', {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      port,
      endpoints: ['POST /mcp', 'GET /health'],
    });
  });

  server.on('error', (err) => {
    logger.error('http server error', { message: err.message });
  });

  client.preWarm().catch((e) => {
    logger.warn('pre-warm errored', { message: e instanceof Error ? e.message : String(e) });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutting down', { signal });
    server.close(() => process.exit(0));
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
