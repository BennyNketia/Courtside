import type { z } from 'zod';

import type { NbaClient } from '../lib/nba-client.js';
import type { NbaError } from '../lib/types.js';

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type ToolDefinition<Shape extends Record<string, z.ZodTypeAny>> = {
  name: string;
  description: string;
  inputSchema: Shape;
  handler: (args: {
    [K in keyof Shape]: z.infer<Shape[K]>;
  }) => Promise<ToolResult>;
};

/** Wrap compact JSON as an MCP tool result. */
export function jsonResult(payload: unknown): ToolResult {
  const text = JSON.stringify(payload);
  return {
    content: [{ type: 'text', text }],
    structuredContent: typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : { value: payload },
  };
}

/** Translate an NbaError from the client to an MCP tool error. */
export function errorResult(nbaError: NbaError): ToolResult {
  const payload = {
    error: nbaError.error,
    retryable: nbaError.retryable,
    ...(nbaError.status !== undefined ? { status: nbaError.status } : {}),
    ...(nbaError.source !== undefined ? { source: nbaError.source } : {}),
    ...(nbaError.availablePlayerIds !== undefined ? { availablePlayerIds: nbaError.availablePlayerIds } : {}),
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
}

/** Convenience: build a factory that receives the shared client. */
export type ToolFactory = (client: NbaClient) => ToolDefinition<Record<string, z.ZodTypeAny>>;
