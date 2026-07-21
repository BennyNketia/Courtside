# TODO.md — Build plan

Rules: phases in order; a phase is done only when its **Done =** line is true; update this file as you go. Every phase leaves the repo shippable — if you stop early, what exists still stands alone.

## Phase 0 — Repo foundation
- [x] Monorepo scaffold (`mcp-server/`, `runtime/`, `client/`, `eval/`, `docs/`) with root README
- [x] TypeScript, ESLint, Prettier, Vitest configured in each package; `.env.example` everywhere
- [x] GitHub Actions: lint + typecheck + test on push
- [x] Get free API keys: balldontlie ✓, Gemini (returns `limit: 0` — deferred to Sprint 2), Groq ✓
- [x] **Data-strategy decision:** BULLETPROOF — see [ADR-0001](docs/adr/0001-data-strategy-bulletproof.md); tool mapping in [CLAUDE.md](CLAUDE.md)
- **Done =** CI green on a hello-world test in each package.

## Phase 1 — MCP server core (BULLETPROOF backing per ADR-0001 / ADR-0003)
- [x] `nba-client.ts`: multi-source client with per-source headers, per-source rate limiters (balldontlie ≈5 req/min, ESPN gentle), TTL cache, pre-warm-on-boot, retry+backoff, seed-file loader — returns `Result<T>`, never throws
- [x] `scripts/refresh-seeds.ts` + first commit of `data/season-averages-2024-25.json` and `data/leaders-2024-25-{pts,reb,ast,stl,blk,fg3m}.json` (~25 top players; refresh runs off-cloud with long timeouts + backoff)
- [x] All 8 tools: `search_players`, `get_team`, `get_team_games`, `get_scoreboard`, `get_standings`, `get_player_season_averages`, `get_league_leaders`, `compare_players` — each with a zod schema, a model-facing description, and compact JSON output; seed-backed responses include `seededAt` + `source`
- [x] Streamable HTTP transport (stateless, `enableJsonResponse: true`) on Express; `/health` reports cache + call stats
- [x] Vitest per tool against a mocked client + HTTP integration test (10 files, 22 tests)
- [x] `mcp-server/README.md` documenting every tool with Claude Desktop config
- **Done =** Claude Desktop pointed at the server answers "compare LeBron and Curry this season" — live boot verified end-to-end (health OK, initialize OK, tools/list returns all 8, pre-warm 3/3 succeeded).

## Phase 2 — (folded into Phase 1) — all 8 tools shipped together

## Phase 3 — Runtime: agent + streaming
- [ ] Model provider: Gemini primary, Groq fallback, per-call token recording
- [ ] `MultiServerMCPClient` config-driven MCP connection; `createReactAgent` with iteration cap + timeout
- [ ] Trace capture wired around the agent (persist even on failure)
- [ ] `POST /agent/run` with typed SSE events; zod validation; CORS; per-IP rate limit
- [ ] Prisma schema (`jobs`, `runs`, `steps`) on SQLite
- **Done =** `curl -N` shows a live run; killing the MCP server mid-run yields status `error` + stored partial trace, service survives.

## Phase 4 — Runtime: jobs + history
- [ ] `POST /agent/schedule`, `GET /jobs`, `DELETE /jobs/:id` (node-cron, jobs reloaded on boot)
- [ ] `GET /runs` (paginated) and `GET /runs/:id` (full trace)
- **Done =** a `* * * * *` test job fires and its trace appears via the API.

## Phase 5 — Client
- [ ] Chat: streaming transcript, inline tool-call chips with latency badges, honest error/timeout states
- [ ] Dashboard: jobs table + create form (cron presets) + runs list
- [ ] Trace viewer: step-by-step replay, collapsible args/results JSON, token + latency ledger
- **Done =** full flow works locally against the real runtime; demo GIF recorded.

## Phase 6 — Eval (NOT optional — the headline depends on it)
- [ ] `eval/dataset.json`: 40 cases per EVALUATION.md
- [ ] Runner + scorer + report generator; `eval:smoke` in CI on PRs
- [ ] **Baseline run** — record honest numbers in the iteration log
- [ ] ≥2 iterations: diagnose from traces → change one thing → re-run → log before/after
- **Done =** `eval/REPORT.md` committed with a multi-row iteration log and final numbers.

## Phase 7 — Deploy + polish
- [ ] Render: MCP server + runtime; Neon Postgres; Vercel: client; all env vars set
- [ ] Root README: pitch, architecture diagram, demo GIF, live URL, eval headline, quickstart, honest limitations
- [ ] ADRs current in `docs/adr/`; record demo GIF from production
- **Done =** a stranger can go from README → live demo → trace viewer → eval report in under 3 minutes.

## Stretch (only after Phase 7)
- [ ] Second MCP server (any small domain, 2 tools) added by config only — screenshot the config diff as proof of the platform claim
- [ ] `stats.nba.com` advanced-stat tools (free, unofficial endpoints)
- [ ] Eval category for the second server (cross-domain tool selection)
