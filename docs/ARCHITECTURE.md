# ARCHITECTURE.md — Courtside

## System overview

```
┌─────────────────────┐
│   React client       │  Vercel (static)
│  chat · jobs · traces│
└─────────┬───────────┘
          │ HTTPS + SSE
┌─────────▼───────────┐
│   Agent runtime      │  Render (Node/Express)
│  LangGraph ReAct     │
│  cron · traces · API │──── Prisma ──▶ Neon Postgres
└─────────┬───────────┘
          │ MCP (Streamable HTTP)
┌─────────▼───────────┐
│   MCP tool server    │  Render (Node/Express)
│  8 NBA tools         │
│  cache · rate limit  │
└─────────┬───────────┘
          │ HTTPS (per-source: headers, pacing, cache)
┌─────────▼───────────┐
│  Free data sources   │  balldontlie (free: teams/players/games)
│                      │  stats.nba.com (season avg/standings/leaders)
│                      │  ESPN (scoreboard/standings fallback)
└─────────────────────┘
```

Three deployables, communicating only over protocols (HTTP/SSE above the runtime, MCP below it). No shared code between tiers.

## Request lifecycle (ad-hoc question)

1. Client `POST /agent/run { question }`; runtime opens an SSE response.
2. Runtime's LangGraph agent starts its ReAct loop: the model reasons, emits a tool call.
3. The MCP adapter forwards the call over Streamable HTTP to the tool server.
4. The tool handler goes through the shared NBA client — cache check → rate-limit queue → balldontlie → retry on transient failure — and returns compact JSON (or a structured error).
5. The result is fed back to the model; loop continues (≤8 iterations, ≤60s).
6. Every event streams to the client as it happens (`tool_call`, `tool_result`, `token`) and is simultaneously appended to the run trace.
7. On completion the full trace persists; the stream ends with `done { runId }` — which the trace viewer can immediately open.

Scheduled jobs run the identical path minus the live SSE consumer; their traces land in the same store.

## Design principles

**Decoupling via protocol.** The runtime knows nothing about basketball; the tool server knows nothing about agents. The seam between them is the MCP protocol itself — which is precisely the problem MCP exists to solve (N×M integrations → N+M). The proof: adding a second tool server of any domain is a config entry in the runtime, not a code change.

**Traces are a first-class product.** Observability wasn't bolted on: the trace store is the substrate for three features at once — the live chat stream, the trace viewer, and the eval harness. One design decision, three payoffs.

**Free-tier constraints treated as production constraints.** Rate limits, quotas, and cold starts aren't hidden; they're engineered around (cache, token bucket, backoff, provider fallback, iteration caps) and documented. The discipline is the same one paid infrastructure demands — the budget just happens to be $0.

**Failure is a designed path.** Tool errors return structured results the model can reason about; the provider falls back Gemini→Groq on quota exhaustion; runs that hit caps end in an honest `timeout`/`max_iterations` status with a stored partial trace. Nothing crashes silently.

---

## Architecture Decision Records

### ADR-001: Author an MCP server rather than defining in-process LangChain tools

**Context.** LangGraph tools could live directly in the runtime — simpler, one service.
**Decision.** Put all tools behind a standalone MCP server.
**Consequences.** (+) Tools usable by any MCP client (Claude Desktop demo, future agents); runtime becomes domain-agnostic; the server is independently open-sourceable; demonstrates the protocol layer employers are adopting. (−) One more deployable and a network hop — accepted; the hop is also where caching lives, so it pays rent.

### ADR-002: LangGraph prebuilt ReAct agent over a hand-rolled loop

**Context.** A hand-written plan-act-observe loop shows more raw plumbing.
**Decision.** Use `createReactAgent` and invest the saved effort in traces, resilience, and eval.
**Consequences.** (+) Battle-tested loop semantics and streaming; the differentiating work goes where competitors don't (observability, evaluation). (−) Less "I wrote the loop" credit — mitigated: the trace viewer shows deeper understanding of the loop than reimplementing it would.

### ADR-003: Gemini Flash primary with Groq fallback

**Context.** $0 constraint excludes paid Claude/GPT for the agent's model.
**Decision.** Gemini Flash (≈1.5k req/day free, strong tool calling) primary; Groq Llama 3.3 70B (free, very fast) as automatic fallback; provider abstraction makes either swappable.
**Consequences.** (+) Genuinely free at portfolio scale; fallback turns a quota problem into a resilience feature worth talking about. (−) Free tiers are rate-limited and non-SLA — acceptable and documented for a demo; the abstraction means a paid model is a one-line upgrade.

### ADR-004: SSE over WebSockets for run streaming

**Context.** Both deliver incremental output.
**Decision.** Server-Sent Events on a POST response.
**Consequences.** (+) Strictly one-directional need; plain HTTP (works through Render's free tier without special config); trivially consumable with fetch + ReadableStream. (−) No client→server mid-run channel — not needed; cancel is a separate DELETE.

### ADR-005: SQLite → Neon Postgres via Prisma

**Context.** Need persistence with zero local setup friction and zero prod cost.
**Decision.** Prisma with SQLite in dev, Neon free tier in prod; identical schema.
**Consequences.** (+) `git clone && npm run dev` works with no database install; prod path is a connection-string change. (−) Minor dialect differences — covered by CI running against both.

### ADR-007: Multi-source free data strategy (balldontlie + stats.nba.com + ESPN)

**Context.** The $0 constraint collides with reality: balldontlie's free tier is only teams/players/games; season averages, standings, leaders, and player statlines are paid. A single free source can't cover the analytics questions the agent needs to answer.
**Decision.** Route each tool to a free source: balldontlie (free) for entity + team-game data; stats.nba.com (unofficial, free, complete) for player season averages/standings/leaders, behind correct headers, gentle pacing, and a pre-warmed cache; ESPN public JSON as a cloud-reliable fallback. Keep a documented "games-and-teams-only" fallback tool set if stats.nba.com throttling proves unworkable in production.
**Consequences.** (+) Stays truly $0 while keeping deep-stat tools; the caching/header/fallback engineering is a genuine story, not busywork. (−) stats.nba.com is unofficial and can throttle datacenter IPs — mitigated by pre-warm + ESPN fallback + honest README limitations; if it ever fully breaks, the bulletproof fallback set ships without it.

### ADR-006: Compact tool outputs as a hard rule

**Context.** balldontlie returns verbose payloads; every byte a tool returns is tokens through a free-tier model, per iteration.
**Decision.** Tools strip to the fields the agent needs; composite tools (`compare_players`, `get_league_leaders`) pre-digest multi-entity data server-side.
**Consequences.** (+) Fewer tokens, fewer iterations, measurably better efficiency scores in eval. (−) Occasional schema updates when a new question type needs a field — cheap, and the eval catches it.
