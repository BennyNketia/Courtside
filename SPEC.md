# SPEC.md — Courtside: agentic NBA analytics platform

A 3-tier agentic system, built entirely on free tiers, in TypeScript end to end:

**React client → Express agent runtime → MCP tool server → NBA data (balldontlie)**

The differentiators this spec bakes in (these are the resume, not the chat UI):
1. A self-authored MCP server — most engineers only consume MCP servers.
2. An agent runtime with scheduling, SSE streaming, persistence, and rate limiting — the serving layer almost nobody builds.
3. Full observability — every run stored as a replayable trace, with a trace viewer in the UI.
4. An eval harness with an iteration log — measured tool-selection accuracy, improved over time, with before/after numbers.
5. Honest failure engineering — caching, retries, tool-failure recovery, graceful degradation, all visible in code and docs.

---

## Tier 1 — MCP tool server (`/mcp-server`)

Standalone service. Registers tools with `@modelcontextprotocol/sdk`, exposes them over Streamable HTTP via an Express route. Must be independently usable: point Claude Desktop at it and it works. This is also independently open-sourceable — its own README documents every tool.

### The shared NBA client (`src/lib/nba-client.ts`)

> **Data-source reality (verified):** balldontlie's FREE tier only exposes **teams, players, and games** (5 req/min). Season averages, standings, league leaders, box scores, and player statlines are **paid** ($9.99+/mo) — so they cannot back a $0 build. The free strategy below routes each tool to a free source and keeps all 8 tools.

Free data strategy (all $0):
- **balldontlie free tier** — entity resolution and team-level game data: `search_players`, `get_team`, `get_team_games`. Reliable from cloud hosting.
- **stats.nba.com** (the same endpoints the Python `nba_api` wraps) — the free, complete source for player season averages, standings, and league leaders. Unofficial: needs browser-like headers (`User-Agent`, `Referer`, `x-nba-stats-origin`) and gentle pacing, and it can throttle datacenter IPs. Mitigation: **aggressive + pre-warmed cache** (see below) so the live demo mostly serves cached data, not real-time calls.
- **ESPN public JSON** (`site.api.espn.com`, no key, cloud-friendly) — fallback for scoreboard and standings if stats.nba.com throttles the deploy host.

All tools call these through one wrapper that provides:
- **Per-source rate limiters** — token bucket at ~5 req/min for balldontlie; a conservative paced queue (with jitter) for stats.nba.com to avoid throttling.
- **Correct headers per source** — stats.nba.com requires the browser-like header set or it returns nothing.
- **In-memory TTL cache** (`Map` keyed by source+endpoint+params). TTLs: players/teams 24h, season averages 1h, standings 30min, scores 30s. Cache hits are logged — the eval report cites hit rate as an efficiency number.
- **Pre-warm on boot** — fetch a small set of common queries (top players, current standings) into cache at startup, so the deployed demo answers instantly and rarely touches stats.nba.com live. This is also the primary mitigation for datacenter-IP throttling.
- **Retry with backoff + jitter** (max 3) on 429/5xx; **cross-source fallback** (stats.nba.com → ESPN) before returning a typed failure.

This one file is a disproportionate share of the project's engineering story: taming an unofficial, hostile-to-datacenter API and a strict free tier into something that behaves like a production dependency is exactly the kind of judgment a reviewer notices.

### Tools (v1 — all backed by free sources)

The "Source" column is the free provider each tool routes to (see the strategy above).

| Tool | Input (zod) | Behavior | Source |
|---|---|---|---|
| `search_players` | `{ name: string }` | Resolve names → player ids, team, position. Top 5 matches. | balldontlie |
| `get_player_season_averages` | `{ player_id: number, season: number }` | ppg/rpg/apg/shooting splits for one season. | stats.nba.com |
| `compare_players` | `{ player_ids: number[] (2-4), season: number }` | **Composite**: fetches all averages (through cache), aligns side-by-side, computes per-stat leader. | stats.nba.com |
| `get_team` | `{ query: string }` | Team lookup by name/city/abbreviation. | balldontlie |
| `get_team_games` | `{ team_id: number, season: number, last_n?: number }` | Game log with scores; `last_n` trims payload. | balldontlie |
| `get_standings` | `{ season: number }` | Conference standings. | stats.nba.com → ESPN fallback |
| `get_scoreboard` | `{ date?: string }` | Games + scores for a day (default today, 30s cache). | ESPN |
| `get_league_leaders` | `{ stat: enum(pts,reb,ast,stl,blk), season: number }` | Season leaders for a stat. | stats.nba.com |

Rules for every tool: description written for the model (it drives tool selection); compact JSON out (strip unused fields — tokens are the budget); structured errors `{ error, retryable }`, never a raw throw.

> **Bulletproof-free alternative:** if stats.nba.com's datacenter throttling proves too flaky in production, drop to a games-and-teams-only tool set (all balldontlie + ESPN, rock-solid from cloud) and reposition the agent around matchups, schedules, and standings rather than deep player stats. Slightly less flashy, zero data risk. Decide this before Phase 1 — it changes which tools you build.
>
> **Paid escape hatch (only if you abandon $0):** balldontlie ALL-STAR ($9.99/mo) makes player stats and season averages a clean one-source build. Noted for completeness; the plan assumes $0.

### Acceptance

- `npm run dev` starts it; an MCP Inspector session lists all 8 tools with schemas.
- Claude Desktop config pointing at it can answer "compare LeBron and Curry this season."
- Unit tests per tool with a mocked NBA client; one integration test over the HTTP transport.

---

## Tier 2 — Agent runtime (`/runtime`)

Express service that owns the agent lifecycle. Discovers tools from the MCP server via `MultiServerMCPClient` (`@langchain/mcp-adapters`) — config-driven, so a second MCP server is a config entry, not a code change.

### Model provider (`src/agent/model.ts`)

- **Primary: Gemini Flash** (`@langchain/google-genai`) — free tier ~1.5k requests/day, no card.
- **Fallback: Groq Llama 3.3 70B** (`@langchain/groq`) — free, very fast; auto-switch on Gemini 429/outage.
- The provider records tokens-in/tokens-out per call into the run trace → per-run "cost ledger" (visible in the trace viewer; headline: "runs at $0.00, and I can prove it").

### Agent (`src/agent/agent.ts`)

`createReactAgent` (LangGraph prebuilt) over the MCP-loaded tools, with:
- **Iteration cap** (8) and per-run wall-clock timeout (60s) — free-tier RPM discipline.
- **Tool-failure recovery**: structured tool errors are fed back to the model with guidance to retry differently or answer with what it has — never a crashed run.
- **System prompt** that teaches the free-tier economics: prefer `compare_players` over N separate calls; resolve names via `search_players` first. (The eval measures whether this works.)

### Trace capture (`src/agent/trace.ts`)

Every run — ad-hoc or scheduled — persists: the question, every model message, every tool call (name, args, result, latency), token counts per step, model used, total latency, final answer, and status (`completed | error | timeout | max_iterations`). Traces are the substrate for the trace viewer AND the eval harness — one design, two payoffs.

### API

| Route | Behavior |
|---|---|
| `POST /agent/run` | Body `{ question }`. SSE stream of typed events: `token`, `tool_call`, `tool_result`, `done { runId }`, `error`. |
| `POST /agent/schedule` | `{ prompt, cron }` → validated, persisted, registered with node-cron. |
| `GET /jobs` / `DELETE /jobs/:id` | List / cancel. |
| `GET /runs?limit&cursor` | Run history (summaries). |
| `GET /runs/:id` | Full trace. |
| `GET /health` | Uptime, MCP connectivity, model provider status — and the URL a recruiter's first click can hit. |

Cross-cutting: zod validation on every route; CORS locked to the client origin; per-IP rate limit on `/agent/run` (protects your free LLM quota from a public demo being hammered); pino structured logs.

### Persistence (Prisma)

`jobs (id, prompt, cron, created_at, active)` · `runs (id, job_id?, question, status, model, tokens_in, tokens_out, latency_ms, answer, created_at)` · `steps (id, run_id, idx, type, name?, args_json?, result_json?, latency_ms)`. SQLite in dev; Neon free Postgres in prod — same schema.

### Acceptance

- `curl -N` against `/agent/run` shows live typed SSE events ending in `done`.
- Kill the MCP server mid-run → run ends `error` with a stored partial trace, service stays up.
- A scheduled job fires on cron and its trace appears in `/runs`.

---

## Tier 3 — Web client (`/client`)

React + Vite + TS. Three features, minimal chrome — the demo is the agent, not the CSS.

**Chat** — streaming transcript (fetch + ReadableStream, parsing SSE lines); tool-call chips render inline as the agent works ("⚙ compare_players({...})") and resolve with latency badges; error/timeout states rendered honestly. This screen is the demo GIF.

**Dashboard** — jobs table (create via form with cron presets — "nightly 8am ET" etc.; cancel); recent runs list with status, model, token, latency columns.

**Trace viewer** — click any run → full step-by-step replay: the model's reasoning turns, each tool call with args/result (collapsible JSON), per-step latency, token ledger. This page is the observability differentiator — link it directly in the README.

Acceptance: deployed on Vercel, talking to the deployed runtime, demo GIF recorded from prod.

---

## Eval harness (`/eval`) — the headline differentiator

Dataset: `eval/dataset.json`, ~40 questions across 5 categories (lookup, comparison, standings/leaders, multi-step, out-of-scope refusal). Each case: question, expected tool sequence (with allowed variation), and answer-check keywords.

Runner: executes each through the agent (throttled for free-tier RPM), scores from the stored traces:
- **Tool-selection accuracy** — right tools, right order (order-insensitive where legitimate)
- **Task completion** — answer contains expected facts
- **Efficiency** — tool calls used vs. minimum needed; cache hit rate
- p50/p95 latency, tokens per category

Report: generated `eval/REPORT.md` with per-category tables — plus the **iteration log**, the single most impressive artifact: run baseline → analyze failures → change one thing (tool description, system prompt, new composite tool) → re-run → record before/after. Even two iterations ("baseline 62% → tool-description rewrite → 85%") demonstrates real AI engineering. Target ≥85% tool selection, ≥80% completion, honestly reported.

CI (GitHub Actions): lint + typecheck + unit tests on every push; 5-case eval smoke suite on PRs to main — "CI that runs agent evals" is a phrase recruiters do not expect from a student repo.

---

## Deployment ($0)

Render free tier: two Node services (MCP server, runtime) — cold starts are fine for a demo; `/health` doubles as a wake endpoint. Neon free Postgres. Vercel for the client. GitHub Actions free minutes. README documents the cold-start honestly — knowing your infra's limits reads as maturity, not weakness.

## Stretch (only after eval report exists)

1. **Second MCP server** (even 2 tools of another domain) — proves the runtime is a platform: config entry, zero code change. Strongest possible interview beat.
2. `stats.nba.com` direct-fetch tools for advanced stats (free, unofficial).
3. LangSmith free-tier tracing alongside the custom viewer.
