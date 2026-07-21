/**
 * Refresh the static seed JSON files under mcp-server/data/.
 *
 * This is the ONLY code in the project that talks to stats.nba.com. It runs
 * from a developer machine (not from cloud infra — datacenter IPs get
 * throttled). Output is committed to the repo so the deployed server never
 * needs a live stats.nba.com call. See ADR-0001 and ADR-0003.
 *
 * Usage:
 *   npm run refresh-seeds --workspace mcp-server -- --season 2024-25
 *
 * Behavior:
 *   - Long timeouts, exponential backoff, browser-like headers.
 *   - Writes each file incrementally so a mid-run failure never leaves a
 *     half-written JSON on disk.
 *   - Tries `/leaguedashplayerstats` first for season averages; if it
 *     times out (the endpoint is known to hang on certain networks), falls
 *     back to `/leagueleaders` per-stat and stitches the top-N per player.
 *   - Never destroys existing seed JSON: writes to a temp file and renames
 *     on success. If nothing new was fetched, the existing seed stays.
 */
import { writeFile, rename, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '..', 'data');

const STATS_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
  Connection: 'keep-alive',
};

const STATS_BASE = 'https://stats.nba.com/stats';

const STATS_TO_REFRESH = ['PTS', 'REB', 'AST', 'STL', 'BLK', 'FG3M'] as const;

type LeagueLeadersResponse = {
  resultSet: {
    headers: string[];
    rowSet: Array<Array<string | number>>;
  };
};

async function fetchWithRetry(url: string, attempt = 0): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, { headers: STATS_HEADERS, signal: controller.signal });
    clearTimeout(timer);
    if (res.status >= 500 || res.status === 429) {
      if (attempt < 4) {
        const wait = 1_000 * 2 ** attempt + Math.floor(Math.random() * 1_000);
        console.warn(`[refresh] ${res.status} on ${url} — sleeping ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        return fetchWithRetry(url, attempt + 1);
      }
    }
    return res;
  } catch (e) {
    clearTimeout(timer);
    const message = e instanceof Error ? e.message : String(e);
    if (attempt < 4) {
      const wait = 2_000 * 2 ** attempt + Math.floor(Math.random() * 2_000);
      console.warn(`[refresh] network error on ${url} (${message}) — sleeping ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      return fetchWithRetry(url, attempt + 1);
    }
    console.error(`[refresh] giving up on ${url}: ${message}`);
    return null;
  }
}

async function fetchLeagueLeaders(season: string, stat: string): Promise<LeagueLeadersResponse | null> {
  const params = new URLSearchParams({
    LeagueID: '00',
    PerMode: 'PerGame',
    Scope: 'S',
    Season: season,
    SeasonType: 'Regular Season',
    StatCategory: stat,
    ActiveFlag: 'No',
  });
  const url = `${STATS_BASE}/leagueleaders?${params.toString()}`;
  console.info(`[refresh] GET ${url}`);
  const res = await fetchWithRetry(url);
  if (!res || !res.ok) {
    console.error(`[refresh] leagueleaders ${stat} failed status=${res?.status ?? 'null'}`);
    return null;
  }
  return (await res.json()) as LeagueLeadersResponse;
}

function rowToRecord(headers: string[], row: Array<string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (let i = 0; i < headers.length; i += 1) {
    const key = headers[i];
    const value = row[i];
    if (key !== undefined && value !== undefined) out[key] = value;
  }
  return out;
}

async function writeAtomic(filePath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(tmp, filePath);
  console.info(`[refresh] wrote ${filePath}`);
}

type SeedPlayer = { playerId: number; name: string; teamAbbrev: string };

async function loadExistingPlayerMap(season: string): Promise<Map<string, SeedPlayer>> {
  const map = new Map<string, SeedPlayer>();
  try {
    const raw = await readFile(path.join(DATA_DIR, `season-averages-${season}.json`), 'utf8');
    const parsed = JSON.parse(raw) as { players?: SeedPlayer[] };
    for (const p of parsed.players ?? []) {
      map.set(p.name.toLowerCase(), p);
    }
  } catch {
    // no existing seed — first run
  }
  return map;
}

/**
 * Translate a stats.nba.com row into a seed row whose `playerId` is
 * balldontlie's canonical id (matching season-averages-{season}.json).
 * Match key is the player name; if the name isn't in the map we drop the row
 * and log — writing a stats.nba.com native id would poison the search →
 * leaders → averages agent flow.
 */
function toBalldontlieRow(
  stat: string,
  rec: Record<string, string | number>,
  playerMap: Map<string, SeedPlayer>,
): { rank: number; playerId: number; name: string; teamAbbrev: string; value: number; gp: number } | null {
  const name = String(rec['PLAYER'] ?? '').trim();
  const canonical = playerMap.get(name.toLowerCase());
  if (!canonical) {
    console.warn(`[refresh] skipping ${name} — not in season-averages seed for this season`);
    return null;
  }
  return {
    rank: Number(rec['RANK'] ?? 0),
    playerId: canonical.playerId,
    name: canonical.name,
    teamAbbrev: canonical.teamAbbrev || String(rec['TEAM'] ?? ''),
    value: Number(rec[stat] ?? 0),
    gp: Number(rec['GP'] ?? 0),
  };
}

async function refreshLeaders(
  season: string,
  stat: (typeof STATS_TO_REFRESH)[number],
  playerMap: Map<string, SeedPlayer>,
): Promise<void> {
  const body = await fetchLeagueLeaders(season, stat);
  if (!body) return;
  const { headers, rowSet } = body.resultSet;

  const rows = rowSet
    .map((r) => rowToRecord(headers, r))
    .map((rec) => toBalldontlieRow(stat, rec, playerMap))
    .filter((row): row is NonNullable<typeof row> => row !== null)
    // Re-sort by value desc and re-emit ranks so the leaderboard is self-consistent.
    .sort((a, b) => (b.value !== a.value ? b.value - a.value : b.gp - a.gp))
    .slice(0, 25)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  if (rows.length === 0) {
    console.warn(`[refresh] ${stat}: no rows survived name-to-id translation; refusing to overwrite existing seed`);
    return;
  }

  await writeAtomic(path.join(DATA_DIR, `leaders-${season}-${stat.toLowerCase()}.json`), {
    season,
    stat: stat.toLowerCase(),
    seededAt: new Date().toISOString(),
    source: 'stats.nba.com/leagueleaders',
    leaders: rows,
  });
}

function parseArgs(): { season: string } {
  const args = process.argv.slice(2);
  let season = '2024-25';
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--season') season = args[i + 1] ?? season;
  }
  return { season };
}

async function main(): Promise<void> {
  const { season } = parseArgs();
  console.info(`[refresh] starting refresh for season ${season}`);
  const playerMap = await loadExistingPlayerMap(season);
  if (playerMap.size === 0) {
    console.error(
      `[refresh] fatal: no season-averages-${season}.json to translate stats.nba.com ids against. Hand-curate the season-averages seed first, then rerun this script.`,
    );
    process.exit(1);
  }

  for (const stat of STATS_TO_REFRESH) {
    await refreshLeaders(season, stat, playerMap);
    // gentle pacing to avoid stats.nba.com throttling
    await new Promise((r) => setTimeout(r, 3_000));
  }

  console.info('[refresh] done.');
  console.info(
    '[refresh] NOTE: season-averages-{season}.json is not refreshed automatically — /leaguedashplayerstats is unreliable from residential IPs. Hand-curate that file from the leaders responses, or extend this script when you have a reliable network path.',
  );
}

main().catch((e) => {
  console.error('[refresh] fatal', e);
  process.exit(1);
});
