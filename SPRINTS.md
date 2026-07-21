# SPRINTS.md — Courtside delivery plan

Seven sprints, roughly one week each part-time (flex to your pace). Each sprint ends with something you can **demo** and, where relevant, a **resume artifact** it produces. Order is load-bearing — later sprints depend on earlier ones. Maps onto the phases in `TODO.md`.

Rule: don't start a sprint until the previous one's "Demo" works. A half-built tier that demos beats three tiers that don't.

---

## Sprint 0 — Foundation & the one real decision
**Goal:** a green-CI monorepo and the data-source call made before any tool is written.
- Scaffold `mcp-server/ runtime/ client/ eval/ docs/`; TS + ESLint + Prettier + Vitest per package; `.env.example` everywhere.
- GitHub Actions: lint + typecheck + test on push.
- Get free keys: balldontlie, Google AI Studio (Gemini), Groq.
- **Decision (do this first): full data strategy** (balldontlie + stats.nba.com + ESPN) **vs bulletproof** (games-and-teams-only, all balldontlie + ESPN). Write the choice into `CLAUDE.md`. Everything downstream depends on it.
- Drop the doc set into `/docs`.

**Demo:** `npm test` green in CI across all packages.
**Risk:** over-configuring tooling. Mitigation: copy configs from one package to the others, move on.

---

## Sprint 1 — The MCP server (Tier 1)
**Goal:** all 8 tools working, server usable standalone.
- Build `nba-client.ts` FIRST: per-source headers, per-source rate limiters, TTL cache, pre-warm-on-boot, stats.nba.com→ESPN fallback.
- Tools in two waves: entity/games (`search_players`, `get_team`, `get_team_games`, `get_scoreboard`) then stats (`get_player_season_averages`, `get_standings`, `get_league_leaders`, `compare_players`).
- Streamable HTTP transport + `/health`. Compact every tool's output. Unit tests (mocked client) per tool.
- `mcp-server/README.md` documenting each tool.

**Demo:** point Claude Desktop at your server and ask "compare LeBron and Curry this season" — it calls your tools and answers.
**Resume artifact:** a standalone, open-sourceable MCP server.
**Risk:** stats.nba.com throttling the datacenter. Mitigation: pre-warm cache; if it's unworkable, fall back to the bulletproof tool set (decision already scoped in Sprint 0).

---

## Sprint 2 — The agent runtime, streaming (Tier 2, part 1)
**Goal:** ask a question over HTTP, watch the agent reason and stream an answer.
- Model provider: Gemini primary, Groq fallback, per-call token recording.
- `MultiServerMCPClient` (config-driven) + `createReactAgent` with iteration cap (8) + 60s timeout.
- Trace capture around every run (persists even on failure).
- `POST /agent/run` with typed SSE events; zod validation; CORS; per-IP rate limit.
- Prisma schema (`jobs`, `runs`, `steps`) on SQLite.

**Demo:** `curl -N` a question and watch typed `tool_call`/`tool_result`/`token` events stream, ending in `done`. Kill the MCP server mid-run → run ends `error`, trace saved, service survives.
**Resume artifact:** the agent-runtime/serving layer — the part almost nobody builds.
**Risk:** free LLM RPM limits during testing. Mitigation: the Groq fallback + iteration cap; test with cheap questions.

---

## Sprint 3 — Jobs, history & the chat UI (Tier 2 part 2 + Tier 3 start)
**Goal:** scheduling + persistence on the back end, and a real chat screen on the front.
- `POST /agent/schedule`, `GET /jobs`, `DELETE /jobs/:id` (node-cron, jobs reloaded on boot).
- `GET /runs` (paginated) + `GET /runs/:id` (full trace).
- Client chat view **per `DESIGN.md`**: dark-only shell (240px sidebar: brand, nav, health dot + model label), shared components first (`Button` ×4 variants, `Input`, `Card`, `Badge`, `ToolChip`, `Modal`, `HealthDot`), then the chat screen — streaming transcript, empty state with 3 example-prompt chips, inline animated tool-call chips with latency badges, honest error/timeout states.

**Demo:** type a question in the browser and watch it stream with tool chips lighting up; a `* * * * *` test job fires and shows in history.
**Risk:** SSE parsing bugs in the client. Mitigation: reuse the reader pattern from SPEC; test against `curl` output first.

---

## Sprint 4 — Dashboard & trace viewer (Tier 3 finish)
**Goal:** the observability story made visible.
- Dashboard **per `DESIGN.md`**: `PageHeader` + `New digest` button, `JobsTable` (Prompt/Schedule/Created/actions: Run now, Cancel-with-confirm-modal), `NewDigestModal` (prompt textarea + cron-preset select), `RunsTable` (Question/Status badge/Model/Tokens/Latency/When, row → trace). Numeric cells in monospace, right-aligned.
- **Trace viewer** per `DESIGN.md`: `TraceHeader` (question, status badge, mono totals row), `StepList` timeline (reasoning / tool_call chip + collapsible args JSON / tool_result JSON + latency), `TokenLedger` panel, `Copy` on JSON blocks.

**Demo:** run a question, open its trace, walk through every reasoning step and tool call.
**Resume artifact:** the trace viewer — your observability differentiator; link it directly in the README.
**Risk:** scope-creeping the UI. Mitigation: minimal chrome; the agent is the star, not the CSS.

---

## Sprint 5 — Evaluation & iteration (the headline — NOT optional)
**Goal:** a measured, improved-over-time accuracy number.
- `eval/dataset.json`: 40 cases across 5 categories (lookup, comparison, standings/leaders, multi-step, out-of-scope refusal).
- Runner + scorer + `eval/REPORT.md` generator; `eval:smoke` (5 cases) wired into CI on PRs.
- **Baseline run** — record honest numbers.
- **≥2 iterations:** diagnose failures from traces → change one thing (tool description, system prompt, a composite) → re-run → log before/after.

**Demo:** `npm run eval` regenerates the report; the iteration log shows the number climbing (e.g. 62% → 85%).
**Resume artifact:** the eval report + iteration log — the single most differentiating thing in the project.
**Risk:** treating a first-try 90% as "done." Mitigation: vary dataset wording vs manual tests; keep failed approaches in the log.

---

## Sprint 6 — Deploy & polish
**Goal:** a stranger can go README → live demo → trace → eval report in under 3 minutes.
- Render: MCP server + runtime; Neon Postgres; Vercel: client; all env vars set.
- Root README from the template: pitch, architecture diagram, demo GIF (recorded from production), live URL, eval headline, quickstart, honest limitations.
- ADRs current; final proofread; small, clean commit history.

**Demo:** the live URL itself.
**Resume artifact:** the deployed link + polished repo — the trifecta (live URL + docs + eval) recruiters actually reward.
**Risk:** cold starts making the demo look broken. Mitigation: document it; `/health` as a wake call; consider a tiny keep-warm ping.

---

## Sprint 7 (stretch — only after Sprint 6) — Prove it's a platform
**Goal:** the best interview closer.
- Add a second MCP server (any small domain, 2 tools) to the runtime **by config only** — screenshot the config diff.
- Add a cross-domain eval category.
- Optional: `stats.nba.com` advanced-stat tools; LangSmith free-tier tracing alongside the custom viewer.

**Demo:** the same agent answering questions across two domains, added without touching runtime code.
**Resume artifact:** proof the runtime is a reusable platform, not a one-off.

---

### If you have to cut
Ship through **Sprint 5** and you still have a top-tier project: deployed isn't done but the MCP server, runtime, trace viewer, and eval all exist and demo. Never cut Sprint 5 to reach Sprint 6 — a deployed demo without eval is common; an evaluated agent is not.
