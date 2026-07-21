import { z } from 'zod';

import type { NbaClient } from '../lib/nba-client.js';
import type { SeasonAveragesSeed } from '../lib/types.js';
import { errorResult, jsonResult, type ToolDefinition } from './shared.js';

const inputSchema = {
  player_id: z.number().int().positive().describe('Canonical player id (from search_players).'),
  season: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .describe('Season start year: 2024 means the 2024-25 season.'),
} as const;

function seasonSlug(season: number): string {
  return `${season}-${String((season + 1) % 100).padStart(2, '0')}`;
}

export function getPlayerSeasonAverages(client: NbaClient): ToolDefinition<typeof inputSchema> {
  return {
    name: 'get_player_season_averages',
    description:
      'Season averages (ppg, rpg, apg, spg, bpg, shooting splits) for one player in one season. Data source: curated static seed refreshed weekly during the season — response includes `seededAt` so callers can qualify claims. If the player is not in the curated set, returns `{error: "player not in curated dataset", availablePlayerIds: [...]}`.',
    inputSchema,
    handler: async ({ player_id, season }) => {
      const slug = seasonSlug(season);
      const seed = await client.seed<SeasonAveragesSeed>(`season-averages-${slug}.json`);
      if (!seed.ok) return errorResult(seed.error);

      const found = seed.data.players.find((p) => p.playerId === player_id);
      if (!found) {
        return errorResult({
          error: 'player not in curated dataset',
          retryable: false,
          source: 'seed',
          availablePlayerIds: seed.data.players.map((p) => p.playerId),
        });
      }

      return jsonResult({
        season,
        seededAt: seed.data.seededAt,
        source: seed.data.source,
        player: {
          id: found.playerId,
          name: found.name,
          teamAbbrev: found.teamAbbrev,
          gp: found.gp,
          min: found.min,
          pts: found.pts,
          reb: found.reb,
          ast: found.ast,
          stl: found.stl,
          blk: found.blk,
          tov: found.tov,
          fgPct: found.fgPct,
          fg3Pct: found.fg3Pct,
          ftPct: found.ftPct,
        },
      });
    },
  };
}
