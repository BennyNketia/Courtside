# CLAUDE.md — Project context for AI-assisted development

## What this project is

**Courtside** — a 3-tier agentic NBA analytics platform. It is a resume centerpiece project. The three tiers are:

1. **MCP tool server** (`/mcp-server`) — a standalone Model Context Protocol server exposing NBA analytics tools over Streamable HTTP.
2. **Agent runtime** (`/runtime`) — an Express service that connects to the MCP server, runs a LangGraph ReAct agent over the discovered tools, streams results via SSE, schedules recurring jobs, and persists full run traces.
3. **Web client** (`/client`) — a React (Vite + TypeScript) app with a streaming chat view, a jobs dashboard, and a trace viewer.

The quality bar is "top-tier junior portfolio project": deployed, documented, evaluated, and resilient — not a demo.

## Hard constraints (never violate)

- **$0 total cost.** Free tiers only: Gemini Flash (primary LLM) or Groq (fallback); **NBA data from free sources only** (see next bullet); SQLite locally / Neon free Postgres in prod; Render free tier (services); Vercel (client); GitHub Actions free minutes. Never introduce a paid dependency.
- **NBA data sourcing (verified constraint).** balldontlie's FREE tier is ONLY teams/players/games — season averages, standings, leaders, and player statlines are PAID. So: use balldontlie free for entity + team-game data; use `stats.nba.com` (unofficial, free, needs browser-like headers + gentle pacing) for player season averages / standings / leaders; keep ESPN (`site.api.espn.com`, free, no key) as a cloud-reliable fallback for scoreboard/standings. Never assume a balldontlie stats endpoint is free. If unsure whether a datum is free, check before building the tool around it.
- **All TypeScript.** No Python anywhere in the build.
- **The MCP server must remain standalone.** It must work with any MCP client (e.g. Claude Desktop) with zero knowledge of the runtime. Never import runtime code into it or vice versa. They communicate only over the MCP protocol.
- **Respect external rate limits.** balldontlie free ≈ 5 req/min; stats.nba.com throttles aggressively and can block datacenter IPs. Every tool call goes through the shared client (`mcp-server/src/lib/nba-client.ts`) with per-source rate limiters, correct per-source headers, a TTL cache, and a **pre-warmed cache on boot** (common queries) so the deployed demo rarely calls stats.nba.com live — never call a data source directly from a tool handler. LLM free tiers are RPM-limited: agent loop caps iterations (max 8) and handles 429s with exponential backoff + Gemini→Groq fallback.

## Stack (fixed — do not swap without updating ARCHITECTURE.md)

- MCP server: `@modelcontextprotocol/sdk`, `zod`, `@balldontlie/sdk`, Express (for the Streamable HTTP transport)
- Runtime: Express, `@langchain/langgraph` (`createReactAgent`), `@langchain/mcp-adapters` (`MultiServerMCPClient`), `@langchain/google-genai` (primary) + `@langchain/groq` (fallback), `node-cron`, Prisma
- Client: React 18 + Vite + TypeScript, plain fetch + ReadableStream for SSE parsing, no state library unless justified
- Tests: Vitest. CI: GitHub Actions.

## Repo layout

```
/mcp-server        # tier 1 — standalone, own package.json, own README
  /src/tools       # one file per tool
  /src/lib         # nba-client (cache + rate limiter), shared types
  /test
/runtime           # tier 2 — Express agent runtime
  /src/agent       # model provider, agent factory, trace capture
  /src/routes      # run, jobs, runs (history), health
  /src/jobs        # cron scheduling
  /prisma
  /test
/client            # tier 3 — React app
  /src/features/chat
  /src/features/dashboard
  /src/features/traces
/eval              # eval harness: dataset, runner, reports
/docs              # ARCHITECTURE.md, EVALUATION.md, ADRs
```

## Conventions

- Every MCP tool: name in `snake_case`, a one-sentence description written for the *model* (it decides tool selection from this text), a `zod` input schema, and a handler that returns compact JSON — strip fields the agent doesn't need. Big payloads waste free-tier tokens.
- Every external call (balldontlie, LLM) is wrapped: timeout, retry with exponential backoff + jitter (max 3), and typed error results. Tools return structured errors (`{ error: string, retryable: boolean }`) — never throw raw — so the agent can recover mid-loop.
- Every agent run persists a full trace: messages, tool calls with args + results, token counts, latency per step, model used, final answer. The trace is the product as much as the answer.
- API inputs validated with `zod` at the route boundary. CORS restricted to the client origin. Secrets only via env vars; `.env.example` kept current.
- Commits: conventional commits (`feat:`, `fix:`, `docs:`, `test:`). Small, coherent commits — this repo will be read by recruiters.
- When you make a non-obvious architectural choice, add an ADR in `/docs/adr/` (one short md file: context, decision, consequences).

## Definition of done (per phase — see TODO.md)

A phase is done when: it runs locally with documented commands, has at least smoke-level tests, handles its failure modes (not just the happy path), and TODO.md is updated. Phase 6 (eval) is not optional — the project's headline claim depends on it.

## What to optimize for

When in doubt, prefer the choice that (a) stays free, (b) makes the system's reasoning more observable, or (c) makes a better story in a recruiter interview — in that order. Clever-but-opaque loses to simple-and-traceable.
