import { z } from 'zod';

import type { NbaClient } from '../lib/nba-client.js';
import type { LeagueLeadersSeed } from '../lib/types.js';
import { errorResult, jsonResult, type ToolDefinition } from './shared.js';

const STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'fg3m'] as const;

const inputSchema = {
  stat: z
    .enum(STATS)
    .describe('One of: pts (points), reb (rebounds), ast (assists), stl (steals), blk (blocks), fg3m (made 3-pointers).'),
  season: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .describe('Season start year: 2024 means the 2024-25 season.'),
  limit: z.number().int().positive().max(25).optional().describe('Top N leaders to return. Default: 10.'),
} as const;

function seasonSlug(season: number): string {
  return `${season}-${String((season + 1) % 100).padStart(2, '0')}`;
}

export function getLeagueLeaders(client: NbaClient): ToolDefinition<typeof inputSchema> {
  return {
    name: 'get_league_leaders',
    description:
      'Top N players for one season stat (points, rebounds, assists, steals, blocks, or made 3s). Compact rows: rank, player, team, value, games played. Data source: curated static seed; response includes `seededAt`.',
    inputSchema,
    handler: async ({ stat, season, limit }) => {
      const cap = limit ?? 10;
      const slug = seasonSlug(season);
      const seed = await client.seed<LeagueLeadersSeed>(`leaders-${slug}-${stat}.json`);
      if (!seed.ok) return errorResult(seed.error);

      // Defensive: sort by value desc (with gp desc as a stable tiebreaker)
      // and re-emit ranks so a caller with `limit: N` always gets the true
      // top-N by value. This makes the tool robust against seeds whose file
      // order is out of sync with the value column (which has happened).
      const sorted = [...(seed.data.leaders ?? [])].sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return (b.gp ?? 0) - (a.gp ?? 0);
      });
      const rows = sorted.slice(0, cap).map((row, i) => ({
        rank: i + 1,
        playerId: row.playerId,
        name: row.name,
        teamAbbrev: row.teamAbbrev,
        value: row.value,
        gp: row.gp,
      }));

      return jsonResult({
        season,
        stat,
        seededAt: seed.data.seededAt,
        source: seed.data.source,
        count: rows.length,
        leaders: rows,
      });
    },
  };
}
