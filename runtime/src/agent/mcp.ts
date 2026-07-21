// Config-driven MCP connection. Sprint 2 talks to a single server (the
// Courtside NBA MCP server on Streamable HTTP), but the shape is
// MultiServerMCPClient's — adding a second server is a config entry, not a
// code change (ADR-001).

import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { toJsonSchema } from '@langchain/core/utils/json_schema';

import type { RuntimeConfig } from '../config.js';

import { sanitizeForGemini } from './gemini-schema.js';

export type McpConnection = {
  client: MultiServerMCPClient;
  tools: DynamicStructuredTool[];
  close: () => Promise<void>;
};

export async function connectMcp(config: RuntimeConfig): Promise<McpConnection> {
  const client = new MultiServerMCPClient({
    // Fail fast if a server errors during load — better a clear boot error
    // than a silent tool-less agent.
    throwOnLoadError: true,
    prefixToolNameWithServerName: false,
    additionalToolNamePrefix: '',
    mcpServers: {
      courtside: {
        transport: 'http',
        url: config.mcp.serverUrl,
      },
    },
  });

  // initializeConnections is optional but we call it eagerly so that the MCP
  // server being unavailable surfaces at request start rather than mid-loop.
  await withTimeout(
    client.initializeConnections(),
    config.mcp.connectTimeoutMs,
    `MCP server did not respond within ${config.mcp.connectTimeoutMs}ms`,
  );

  const rawTools = await client.getTools();
  const tools = rawTools.map((tool) => rewrapForGemini(tool));

  return {
    client,
    tools,
    close: () => client.close().catch(() => undefined),
  };
}

/**
 * The MCP adapter hands us `DynamicStructuredTool`s whose `.schema` is the
 * MCP JSON schema (which mirrors our Zod schemas server-side). Google
 * Gemini's function-calling schema is stricter than OpenAI's — it rejects
 * modern JSON-Schema keywords like `exclusiveMinimum` that Zod v4 emits from
 * `.int()`/`.positive()`. We rebuild each tool with a sanitized JSON schema
 * so it's accepted by Gemini AND OpenAI/Groq/etc. Delegating `func` to the
 * original tool's `.invoke()` keeps the runtime tool-call round-trip intact
 * — validation still happens against the MCP server itself.
 */
function rewrapForGemini(original: DynamicStructuredTool): DynamicStructuredTool {
  const jsonSchema = toJsonSchema(original.schema);
  const sanitized = sanitizeForGemini(jsonSchema) as Record<string, unknown>;

  return new DynamicStructuredTool({
    name: original.name,
    description: original.description,
    schema: sanitized,
    func: async (input: unknown) => {
      // Delegate to the original — it handles the MCP round-trip, tool
      // errors, and content formatting. `.invoke()` returns the tool's
      // content (a string of JSON in our case) which LangGraph packages
      // into a ToolMessage automatically.
      return original.invoke(input as never);
    },
  });
}

async function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
