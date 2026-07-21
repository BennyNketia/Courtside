# ADR-0004: LangGraph ReAct + Streamable HTTP MCP client + Prisma-backed trace

**Status:** accepted (Sprint 2)

## Context

Tier 2 is the agent runtime — the piece nobody who "uses an LLM" actually
builds. We need:

- Streaming answers to a browser without WebSockets.
- Tool discovery from a separate MCP server (Tier 1), decoupled by protocol.
- A trace substrate that powers three features at once: the live SSE stream,
  the future trace viewer, and the eval harness.
- Real-world resilience — the MCP server can die mid-run, the primary LLM's
  free-tier quota can lapse, and the wall-clock has a hard cap.

## Decision

1. **Agent core:** `@langchain/langgraph`'s prebuilt `createReactAgent` over
   MCP-discovered tools. Iteration cap = 8; wall-clock timeout = 60s. Both
   are configurable via env. Fits ADR-002.
2. **Tool discovery:** `MultiServerMCPClient` from `@langchain/mcp-adapters`
   with a single Streamable HTTP entry. Adding another MCP server is a
   config entry, not a code change (SPEC's decoupling claim).
3. **Model provider:** primary = Gemini (`gemini-flash-latest`), fallback =
   Groq (`llama-3.3-70b-versatile`). Fallback runs at the agent-attempt level
   (not the model-invocation level) so LangGraph's `_isBaseChatModel`
   detection still recognizes a plain `ChatGoogleGenerativeAI` /
   `ChatGroq` — a wrapper class fails that runtime probe. Token accounting
   flows through a shared `UsageBucket` populated by a
   `handleLLMEnd` callback attached to each model.
4. **Tool schema sanitization:** Gemini's function-calling schema rejects
   `exclusiveMinimum` / `exclusiveMaximum` / etc. that Zod v4 emits by default.
   The runtime post-processes each MCP tool's schema through
   `sanitizeForGemini` (a targeted OpenAPI-3.0 subset transform) before
   handing them to the LLM. The MCP server itself still validates against
   the original Zod schema on tool-call — sanitation only affects what the
   LLM SEES.
5. **Trace persistence:** Prisma with SQLite for dev, Neon Postgres in prod
   (ADR-005). Every run persists on both success AND failure paths. Failure
   paths write a `status: 'error' | 'timeout' | 'max_iterations'` row with
   whatever partial trace exists.
6. **SSE, not WebSockets:** ADR-004 (existing) already decided this. Typed
   event names (`token`, `tool_call`, `tool_result`, `error`, `done`) so a
   client can `switch` on `event:` without parsing `data:`.
7. **Guardrails at the boundary:** zod validation on the request body, CORS
   locked to `CLIENT_ORIGIN`, per-IP rate limit on `/agent/run` (defaults to
   10 req / 60s / IP) — protects the free-tier LLM quota from an unattended
   public demo.

## Consequences

- **(+)** The runtime is a legitimate agent-serving layer, not a demo. It
  streams, it degrades gracefully when the MCP tool server dies, it fails
  loudly on quota exhaustion, and every run is replayable from disk.
- **(+)** The tool-schema sanitizer is a portable interoperability shim: any
  future tool server's schema goes through the same filter, so the runtime
  works with any MCP-compliant tool provider — not just ours.
- **(−)** Two chat-model instantiations at boot even when only one is
  actually going to fire — negligible memory, keeps the fallback logic
  branch-free at request time.
- **(−)** The token bucket is per-process, not per-user; a shared demo can
  starve legitimate users if traffic spikes. Sprint 3 revisits when the
  scheduling / persistence layer needs a fairer scheme.
