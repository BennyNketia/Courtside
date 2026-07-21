# ADR-0003: Static seed JSON as the cache backing for stats-heavy tools

- Status: Accepted
- Date: 2026-07-20
- Depends on: [ADR-0001](0001-data-strategy-bulletproof.md)
- Sprint: 0

## Context

CLAUDE.md mandates a "pre-warmed cache on boot" so the deployed MCP server
rarely calls stats.nba.com live. ADR-0001 goes further: under BULLETPROOF, the
deployed server never calls stats.nba.com at all. We still need to answer
questions like "what did Curry average this season?" — the data has to live
somewhere.

## Decision

Commit **static seed JSON files** under `mcp-server/data/` and treat them as
the source of truth for the three seed-backed tools:

```
mcp-server/data/
  season-averages-2025-26.json     # top ~150 players
  leaders-2025-26-pts.json         # top 25 per stat category
  leaders-2025-26-ast.json
  leaders-2025-26-reb.json
  leaders-2025-26-stl.json
  leaders-2025-26-blk.json
  leaders-2025-26-fg3m.json
```

A separate script, `mcp-server/scripts/refresh-seeds.ts`, is the *only* code
that talks to stats.nba.com. It runs on a dev machine, hits
`stats.nba.com/leaguedashplayerstats` and `/leagueleaders` with browser-like
headers and long timeouts + backoff, writes the JSON files incrementally
(resume-on-fail), and the developer commits the diff.

Every tool response that reads from a seed file includes:

```json
{ "data": ..., "seededAt": "2026-07-14T00:00:00Z", "source": "stats.nba.com" }
```

so the agent can qualify claims ("as of last week's snapshot…") and the eval
harness can detect staleness.

## Consequences

- Deployed MCP server has no runtime dependency on stats.nba.com. Cold-boot
  latency is one file read per query, well inside CLAUDE.md's cache TTL story.
- Seeds are just files in git. Refresh is a diff; rollback is a `git revert`.
  The eval report can reference the exact seed commit used for each iteration.
- Seeds age. The `seededAt` field forces honesty. During the season the
  refresh cadence is weekly; off-season, monthly.
- Bounded player set. `get_player_season_averages` returns a structured error
  `{error: "player not in curated dataset", retryable: false, availablePlayerIds: [...]}`
  when a stat request falls outside the seed. The eval dataset (Sprint 5)
  restricts stat questions to the seeded set.
- If stats.nba.com fixes its datacenter behavior (or we take the paid escape
  hatch), the seed layer stays as an authoritative cache in front of the live
  source without changing tool signatures.

## Alternatives considered

- **Live stats.nba.com with retry + long TTL cache in memory.** Fails whenever
  the deploy host is on a blocked IP range. Probe (ADR-0001) already showed 2/3
  timeouts from a friendly network.
- **SQLite-backed cache.** More moving parts, no benefit over a JSON file at
  this scale (thousands of rows, not millions), and worse for eval-report
  traceability.
