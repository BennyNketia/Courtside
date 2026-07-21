import { z } from 'zod';

import type { NbaClient } from '../lib/nba-client.js';
import { errorResult, jsonResult, type ToolDefinition } from './shared.js';

type BdlGame = {
  id: number;
  date: string;
  season: number;
  status: string;
  period: number;
  time: string | null;
  postseason: boolean;
  home_team_score: number;
  visitor_team_score: number;
  home_team: { id: number; abbreviation: string };
  visitor_team: { id: number; abbreviation: string };
};

type BdlGamesResponse = { data: BdlGame[]; meta?: { next_cursor?: number } };

const inputSchema = {
  team_id: z.number().int().positive().describe('balldontlie team id (from get_team).'),
  season: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .describe('Season start year: 2024 means the 2024-25 season.'),
  last_n: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Return only the most recent N games. Default: 20.'),
} as const;

export function getTeamGames(client: NbaClient): ToolDefinition<typeof inputSchema> {
  return {
    name: 'get_team_games',
    description:
      "Game log for one team in a given season with dates, opponents, and scores. Use `last_n` to trim payload — token budget is tight. Source: balldontlie free tier.",
    inputSchema,
    handler: async ({ team_id, season, last_n }) => {
      const limit = last_n ?? 20;
      const isCurrent = season >= new Date().getFullYear() - 1;
      const ttl = isCurrent ? 30_000 : 60 * 60 * 1000;

      const result = await client.balldontlie<BdlGamesResponse>(
        '/games',
        { 'team_ids[]': team_id, 'seasons[]': season, per_page: 100 },
        ttl,
      );
      if (!result.ok) return errorResult(result.error);

      const rows = (result.data.data ?? [])
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit)
        .map((g) => ({
          id: g.id,
          date: g.date,
          season: g.season,
          status: g.status,
          postseason: g.postseason,
          home: { id: g.home_team.id, abbrev: g.home_team.abbreviation, score: g.home_team_score },
          away: {
            id: g.visitor_team.id,
            abbrev: g.visitor_team.abbreviation,
            score: g.visitor_team_score,
          },
        }));

      return jsonResult({ teamId: team_id, season, count: rows.length, games: rows });
    },
  };
}
