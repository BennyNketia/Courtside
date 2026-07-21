import express, { type Express } from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { logger } from './lib/logger.js';
import { NbaClient } from './lib/nba-client.js';
import { registerTools } from './tools/index.js';

export const PACKAGE_NAME = 'courtside-mcp-server';
export const PACKAGE_VERSION = '0.1.0';

export type BuildAppOptions = {
  client?: NbaClient;
  buildServer?: () => McpServer;
};

/** Build an MCP server pre-populated with every Courtside tool. */
export function buildMcpServer(client: NbaClient): McpServer {
  const server = new McpServer(
    { name: PACKAGE_NAME, version: PACKAGE_VERSION },
    { capabilities: { logging: {} } },
  );
  registerTools(server, client);
  return server;
}

/** Assemble the Express app. Stateless mode: fresh MCP server + transport per POST. */
export function buildApp(options: BuildAppOptions = {}): { app: Express; client: NbaClient } {
  const client = options.client ?? new NbaClient();
  const buildServer = options.buildServer ?? (() => buildMcpServer(client));

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Browser-origin allowlist. MCP clients are typically Node processes that
  // don't send Origin at all — CORS only matters when a browser (e.g. an
  // MCP Inspector web UI) hits the server. Default: no browser origin
  // allowed. Override via MCP_ALLOWED_ORIGINS (comma-separated) to permit
  // specific origins. Never wildcard by default — a public wildcard lets any
  // web page drain our rate-limited free-tier upstream quota.
  const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      exposedHeaders: ['Mcp-Session-Id'],
      allowedHeaders: ['Content-Type', 'Mcp-Session-Id'],
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      time: new Date().toISOString(),
      stats: client.stats(),
    });
  });

  app.post('/mcp', async (req, res) => {
    const server = buildServer();
    // Stateless mode: `sessionIdGenerator: undefined` is documented on the transport,
    // but its type says `() => string` — the SDK checks for undefined at runtime.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined as unknown as () => string,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      transport.close().catch((e) => logger.warn('transport close failed', { message: String(e) }));
      server.close().catch((e) => logger.warn('server close failed', { message: String(e) }));
    });
    try {
      // The SDK's Transport interface is compatible at runtime, but
      // exactOptionalPropertyTypes trips on optional handler declarations.
      await server.connect(transport as unknown as Parameters<McpServer['connect']>[0]);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('mcp request failed', { message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'internal error' },
          id: null,
        });
      }
    }
  });

  const methodNotAllowed = (_req: express.Request, res: express.Response) =>
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST /mcp for JSON-RPC.' },
      id: null,
    });
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  return { app, client };
}
