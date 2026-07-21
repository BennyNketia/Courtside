# @courtside/mcp-server

A standalone [Model Context Protocol](https://modelcontextprotocol.io/) server exposing 8 NBA analytics tools over **Streamable HTTP**. It is Tier 1 of the [Courtside](../README.md) project but is independently open-sourceable: point Claude Desktop or any MCP client at it and it works.

- **Zero-cost data.** balldontlie free tier (teams/players/games) + ESPN public JSON (scoreboard/standings) + a committed static-seed cache for player season averages and league leaders. See [ADR-0001](../docs/adr/0001-data-strategy-bulletproof.md) for the "BULLETPROOF" data strategy this server implements.
- **Never calls `stats.nba.com` at runtime.** Only the developer-run `scripts/refresh-seeds.ts` does — its output is committed to `data/`.
- **Never throws from a tool handler.** Every failure is a structured `{ error, retryable, source }` payload the agent can reason about.

## Tools

Every tool: `name` in `snake_case`, a short description written for the model (it drives selection), a zod input schema, and compact JSON output.

| Tool | Input | Output | Source |
|---|---|---|---|
| `search_players` | `{ name: string }` | Top-5 rows: `{id, name, position, team.{id,abbrev,name}}` — resolve names → ids **before** any player-id tool | balldontlie |
| `get_team` | `{ query: string }` | `{team: {id, abbrev, city, name, conference, division}}` — accepts full name / city / 3-letter abbrev | balldontlie → ESPN fallback |
| `get_team_games` | `{ team_id, season, last_n? }` | `{games: [{id, date, home:{abbrev,score}, away:{abbrev,score}, ...}]}` — sorted newest-first, capped by `last_n` (default 20) | balldontlie |
| `get_scoreboard` | `{ date? }` | `{games: [{home:{abbrev,score,record}, away, status}]}` — defaults to today (US Eastern), 30s cache | ESPN |
| `get_standings` | `{ season }` | `{standings: [{teamId, abbrev, wins, losses, winPct, gamesBack, streak, conference}]}` | ESPN (current season) → seed fallback |
| `get_player_season_averages` | `{ player_id, season }` | `{player: {name, pts, reb, ast, stl, blk, tov, fgPct, ...}, seededAt}` — response carries `seededAt` so the agent can qualify claims | static seed |
| `get_league_leaders` | `{ stat, season, limit? }` | `{leaders: [{rank, name, teamAbbrev, value, gp}]}` — stat ∈ pts/reb/ast/stl/blk/fg3m | static seed |
| `compare_players` | `{ player_ids[2-4], season }` | `{players: [...], leaders: {pts:{...}, reb:{...}, ...}}` — one call replaces N `get_player_season_averages` | static seed (composite) |

If a `player_id` isn't in the curated dataset, the tool returns `{error: "player not in curated dataset", retryable: false, availablePlayerIds: [...]}` — never throw.

The curated dataset holds ~25 top players for the 2024-25 season. Extend it by refreshing seeds (see below).

## Setup

Requires Node 20+. From the repo root:

```bash
cp .env.example .env      # fill BALLDONTLIE_API_KEY
npm install
npm run dev --workspace mcp-server
```

The server listens on `http://localhost:3001` by default. Endpoints:

- `POST /mcp` — Streamable HTTP transport (JSON-RPC).
- `GET /health` — JSON with `{status, name, version, time, stats}` including cache hit/miss counts and per-source call counters.

The server **pre-warms** the balldontlie teams list, ESPN scoreboard, and ESPN standings on boot so the first agent request rarely touches an upstream.

## Verify with Claude Desktop

Claude Desktop supports MCP tool servers via the config at `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows). Add:

```jsonc
{
  "mcpServers": {
    "courtside": {
      "url": "http://localhost:3001/mcp",
      "transport": "streamable-http"
    }
  }
}
```

Restart Claude Desktop. In a new chat, type:

> compare LeBron and Curry this season

Claude will call `search_players` twice (or once for both — model's choice), then `compare_players` with the resolved ids. The response includes `seededAt` so the answer honestly qualifies the snapshot date.

Additional prompts that exercise every tool:

- "who leads the league in assists this season?" → `get_league_leaders`
- "what does the standings look like in the West?" → `get_standings`
- "what's the score of last night's Celtics game?" → `get_scoreboard`
- "how did the Lakers play their last five games?" → `get_team` → `get_team_games`

## Refreshing seeds

The three seed-backed tools (`get_player_season_averages`, `compare_players`, `get_league_leaders`) read from `data/season-averages-{season}.json` and `data/leaders-{season}-{stat}.json`. To refresh from `stats.nba.com`:

```bash
npm run refresh-seeds --workspace mcp-server -- --season 2024-25
```

Run this from your **local machine**, not a cloud host — `stats.nba.com` blocks most datacenter IPs. Commit the resulting JSON diff.

Note: `stats.nba.com/leaguedashplayerstats` (the source for full player averages) hangs on many residential networks — the script prefers `/leagueleaders` and stitches per-stat rows. For the full player-averages seed, hand-curate from the leaders responses or extend the script when a reliable network path exists.

## Development

```bash
npm run typecheck --workspace mcp-server    # tsc against src + tests + scripts
npm run test      --workspace mcp-server    # vitest — 22 tests, ~1s
npm run lint      --workspace mcp-server
npm run build     --workspace mcp-server    # emits dist/
npm run start     --workspace mcp-server    # runs dist/index.js
```

Environment variables (see [`.env.example`](.env.example)):

- `BALLDONTLIE_API_KEY` — required.
- `MCP_PORT` — default `3001`.
- `LOG_LEVEL` — `trace | debug | info | warn | error`; default `info`.

## Architecture

- [`src/lib/nba-client.ts`](src/lib/nba-client.ts) — the shared client every tool uses. Per-source rate limiters, per-source headers, TTL cache, pre-warm-on-boot, retry with backoff + jitter, seed loading. Returns `Result<T>` — never throws.
- [`src/tools/*`](src/tools/) — one file per tool. Each exports `{name, description, inputSchema, handler}`; `src/tools/index.ts` registers them all onto an `McpServer`.
- [`src/server.ts`](src/server.ts) — Express app with `POST /mcp` (Streamable HTTP transport, stateless) and `GET /health`.
- [`scripts/refresh-seeds.ts`](scripts/refresh-seeds.ts) — the only code that talks to `stats.nba.com`.
- [`data/`](data/) — committed seed JSON.

## License

MIT.
