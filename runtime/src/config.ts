// Runtime configuration read from env — one place so tests and route wiring
// pull from the same source. Everything has a dev-friendly default; secrets
// (API keys) fail loudly at agent-build time, not at process start, so the
// service can still serve /health without them.

export type RuntimeConfig = {
  port: number;
  clientOrigin: string;
  databaseUrl: string;
  mcp: {
    serverUrl: string;
    // MCP client init timeout; if the MCP server is down we should surface
    // that fast rather than let the SSE stream hang.
    connectTimeoutMs: number;
  };
  agent: {
    // Hard cap on ReAct iterations — matches SPEC and CLAUDE.md.
    maxIterations: number;
    // Wall-clock timeout per run.
    timeoutMs: number;
  };
  model: {
    geminiApiKey: string | undefined;
    geminiModel: string;
    groqApiKey: string | undefined;
    groqModel: string;
  };
  rateLimit: {
    // Per-IP requests per window.
    max: number;
    windowMs: number;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const port = Number.parseInt(env.PORT ?? '3002', 10);
  return {
    port: Number.isFinite(port) ? port : 3002,
    clientOrigin: env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    databaseUrl: env.DATABASE_URL ?? 'file:./dev.db',
    mcp: {
      serverUrl: env.MCP_SERVER_URL ?? 'http://localhost:3001/mcp',
      connectTimeoutMs: Number.parseInt(env.MCP_CONNECT_TIMEOUT_MS ?? '5000', 10),
    },
    agent: {
      maxIterations: Number.parseInt(env.AGENT_MAX_ITERATIONS ?? '8', 10),
      timeoutMs: Number.parseInt(env.AGENT_TIMEOUT_MS ?? '60000', 10),
    },
    model: {
      geminiApiKey: env.GEMINI_API_KEY || undefined,
      geminiModel: env.GEMINI_MODEL ?? 'gemini-flash-latest',
      groqApiKey: env.GROQ_API_KEY || undefined,
      // Llama 3.3 70B versatile — Groq's free-tier flagship.
      groqModel: env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    },
    rateLimit: {
      max: Number.parseInt(env.RATE_LIMIT_MAX ?? '10', 10),
      windowMs: Number.parseInt(env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
    },
  };
}
