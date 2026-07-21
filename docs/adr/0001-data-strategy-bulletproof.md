# ADR-0001: Adopt the BULLETPROOF data strategy

- Status: Accepted
- Date: 2026-07-20
- Deciders: BennyNketia
- Sprint: 0

## Context

SPEC.md's "Data-source reality" section forces a Sprint 0 decision between two paths:

- **FULL** — balldontlie (free) + stats.nba.com + ESPN, with stats.nba.com backing
  `get_player_season_averages`, `compare_players`, and `get_league_leaders`.
- **BULLETPROOF** — balldontlie (free) + ESPN live only; anything that would need
  stats.nba.com in prod is instead served from a static seed JSON refreshed
  off-cloud (from a dev machine) and committed to the repo.

Before choosing, we probed every source with real calls:

| Source | Result |
|---|---|
| balldontlie `/v1/teams`, `/v1/players`, `/v1/games` | 200 with the API key from `.env` |
| balldontlie `/v1/season_averages`, `/v1/stats` | 401 Unauthorized — paid tier, as documented |
| stats.nba.com `/leaguedashplayerstats` (season averages) | **Timed out, zero bytes** after 15s with browser-like headers |
| stats.nba.com `/leaguestandingsv3` | **Timed out, zero bytes** after 15s |
| stats.nba.com `/leagueleaders` | 200 (~31 KB, valid JSON) |
| ESPN `/scoreboard`, `/standings`, `/teams`, `/news` | 200 across the board |
| Google Gemini `generateContent` | 429 with `limit: 0` — provisioned key has no free-tier allocation |
| Groq `chat/completions` (llama-3.1-8b-instant) | 200, returned expected content |

Two of three stats.nba.com endpoints hung silently from a residential Mac IP with
3-second pacing. That is the friendliest network conditions we will ever see.
On Render's datacenter egress the surface degrades further; stats.nba.com is
widely documented to drop or block AWS/GCP/Fly/Render traffic.

## Decision

Adopt **BULLETPROOF**.

Live data sources in prod:

- `search_players`, `get_team`, `get_team_games` → balldontlie free tier
- `get_scoreboard`, `get_standings` → ESPN `site.api.espn.com`

Seed-backed tools (name and shape preserved; data comes from a JSON file
committed at `mcp-server/data/`):

- `get_player_season_averages` → `data/season-averages-{season}.json`
- `compare_players` → composite over the same seed
- `get_league_leaders` → `data/leaders-{season}-{stat}.json` (this stats.nba.com
  endpoint did return 200 in the probe, so the seed refresh should be reliable
  from a dev machine)

A `scripts/refresh-seeds.ts` in mcp-server regenerates the JSON files by calling
stats.nba.com from the developer machine with browser-like headers, long
timeouts, exponential backoff, and incremental writes. The refresh is run
manually (roughly weekly during the season) and the resulting JSON is committed
to git. Every seed-backed tool response includes a `seededAt` ISO timestamp so
the agent can qualify claims.

## Consequences

Good:

- The deployed MCP server never depends on stats.nba.com reachability. The demo
  and eval do not flake because an unofficial API decided to drop our IP range.
- CLAUDE.md's "pre-warmed cache on boot" requirement is trivially satisfied —
  the cache *is* the source of truth for the three affected tools.
- The recruiter-facing narrative becomes "I probed the sources, one was
  unreliable, so I built a curated dataset with a documented refresh path" —
  discipline over false breadth.

Trade-offs:

- Seed data ages. Refresh cadence during the season should be weekly; a stale
  seed will report averages from a slightly earlier snapshot. Mitigated by the
  `seededAt` field and README language.
- The seeded player set is bounded (target ~top 150). Questions about deep bench
  players hit a structured "player not in curated dataset" error. The eval
  dataset (Sprint 5) samples only within the seeded set for stats-dependent
  categories.
- If Google fixes the Gemini `limit: 0` quota (see ADR-0003 note), we regain the
  documented primary/fallback story. Until then Groq is effectively primary.

## Alternatives considered

**FULL.** Requires every stats.nba.com-dependent tool to have a working
fallback. ESPN has no per-player season averages endpoint, so the only viable
fallback is a static cache — which is BULLETPROOF wearing a live-data disguise
that will keep breaking during demos. Rejected.

**Paid escape hatch** (balldontlie ALL-STAR, $9.99/mo). Violates the $0 total
cost constraint. Documented in SPEC.md but out of scope.
