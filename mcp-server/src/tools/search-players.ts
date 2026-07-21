import { z } from 'zod';

import type { NbaClient } from '../lib/nba-client.js';
import { errorResult, jsonResult, type ToolDefinition } from './shared.js';

type BdlPlayer = {
  id: number;
  first_name: string;
  last_name: string;
  position: string | null;
  height: string | null;
  weight: string | null;
  team: { id: number; abbreviation: string; full_name: string } | null;
};

type BdlPlayersResponse = { data: BdlPlayer[] };

const inputSchema = {
  name: z.string().min(1).describe('Full or partial player name to search for (case-insensitive).'),
} as const;

export function searchPlayers(client: NbaClient): ToolDefinition<typeof inputSchema> {
  return {
    name: 'search_players',
    description:
      'Resolve NBA player names to canonical ids. Use this BEFORE any tool that takes a player_id. Returns top 5 matches with team + position. Source: balldontlie free tier.',
    inputSchema,
    handler: async ({ name }) => {
      const result = await client.balldontlie<BdlPlayersResponse>(
        '/players',
        { search: name, per_page: 25 },
        24 * 60 * 60 * 1000,
      );
      if (!result.ok) return errorResult(result.error);

      const rows = (result.data.data ?? [])
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`.trim(),
          position: p.position || null,
          height: p.height || null,
          weight: p.weight || null,
          team: p.team ? { id: p.team.id, abbrev: p.team.abbreviation, name: p.team.full_name } : null,
        }));

      return jsonResult({ query: name, count: rows.length, players: rows });
    },
  };
}
