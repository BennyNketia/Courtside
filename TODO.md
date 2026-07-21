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
- [ ] `nba-client.ts`: multi-source client with per-source headers, per-source rate limiters (balldontlie ≈5 req/min, ESPN gentle), TTL cache, pre-warm-on-boot, and seed-file loader for stats data (build FIRST — every tool depends on it)
- [ ] `scripts/refresh-seeds.ts` + first commit of `data/season-averages-{season}.json` and `data/leaders-{season}-{stat}.json` (run off-cloud from dev machine against stats.nba.com with long timeouts + backoff)
- [ ] Tools: `search_players` (balldontlie), `get_team` (balldontlie), `get_player_season_averages` (seed JSON), `get_standings` (ESPN → seed fallback)
- [ ] Streamable HTTP transport on Express; `/health`
- [ ] Unit tests (mocked client) for each tool; MCP Inspector session verified
- **Done =** Claude Desktop pointed at the server answers "what did Curry average this season?"

## Phase 2 — Remaining tools
- [ ] `get_team_games` (balldontlie), `get_scoreboard` (ESPN)
- [ ] `compare_players` (composite over the seed JSON), `get_league_leaders` (seed JSON)
- [ ] Output compaction pass on all 8 (strip unused fields); ensure seed-backed responses include `seededAt` + `source`
- [ ] `mcp-server/README.md` documenting every tool (this package is independently open-sourceable)
- **Done =** integration test lists 8 tools and exercises each over HTTP.

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
