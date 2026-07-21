import { z } from 'zod';

import type { NbaClient } from '../lib/nba-client.js';
import type { SeasonAveragesSeed } from '../lib/types.js';
import { errorResult, jsonResult, type ToolDefinition } from './shared.js';

const inputSchema = {
  player_ids: z
    .array(z.number().int().positive())
    .min(2)
    .max(4)
    .describe('2 to 4 canonical player ids (from search_players). ONE call replaces N separate get_player_season_averages calls — prefer this for any head-to-head question.'),
  season: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .describe('Season start year: 2024 means the 2024-25 season.'),
} as const;

const COMPARE_STATS = [
  'pts',
  'reb',
  'ast',
  'stl',
  'blk',
  'tov',
  'fgPct',
  'fg3Pct',
  'ftPct',
  'min',
  'gp',
] as const;

function seasonSlug(season: number): string {
  return `${season}-${String((season + 1) % 100).padStart(2, '0')}`;
}

export function comparePlayers(client: NbaClient): ToolDefinition<typeof inputSchema> {
  return {
    name: 'compare_players',
    description:
      'Compare season averages for 2-4 players side-by-side and identify the leader per stat (pts, reb, ast, stl, blk, tov [lower=better], shooting splits). Prefer this over calling get_player_season_averages multiple times — cheaper in tokens. Data source: curated static seed; response includes `seededAt`.',
    inputSchema,
    handler: async ({ player_ids, season }) => {
      const slug = seasonSlug(season);
      const seed = await client.seed<SeasonAveragesSeed>(`season-averages-${slug}.json`);
      if (!seed.ok) return errorResult(seed.error);

      const missing: number[] = [];
      const rows = player_ids.map((id) => {
        const found = seed.data.players.find((p) => p.playerId === id);
        if (!found) missing.push(id);
        return found;
      });

      if (missing.length > 0) {
        return errorResult({
          error: `player(s) not in curated dataset: ${missing.join(', ')}`,
          retryable: false,
          source: 'seed',
          availablePlayerIds: seed.data.players.map((p) => p.playerId),
        });
      }

      const players = rows.map((r) => ({
        id: r!.playerId,
        name: r!.name,
        teamAbbrev: r!.teamAbbrev,
        stats: {
          pts: r!.pts,
          reb: r!.reb,
          ast: r!.ast,
          stl: r!.stl,
          blk: r!.blk,
          tov: r!.tov,
          fgPct: r!.fgPct,
          fg3Pct: r!.fg3Pct,
          ftPct: r!.ftPct,
          min: r!.min,
          gp: r!.gp,
        },
      }));

      const leaders: Record<string, { playerId: number; name: string; value: number }> = {};
      for (const stat of COMPARE_STATS) {
        const lowerIsBetter = stat === 'tov';
        let best = players[0]!;
        for (const p of players) {
          const cur = p.stats[stat];
          const cmp = best.stats[stat];
          if ((lowerIsBetter && cur < cmp) || (!lowerIsBetter && cur > cmp)) best = p;
        }
        leaders[stat] = { playerId: best.id, name: best.name, value: best.stats[stat] };
      }

      return jsonResult({
        season,
        seededAt: seed.data.seededAt,
        source: seed.data.source,
        players,
        leaders,
      });
    },
  };
}
