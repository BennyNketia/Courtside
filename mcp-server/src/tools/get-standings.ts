import { z } from 'zod';

import type { NbaClient } from '../lib/nba-client.js';
import { errorResult, jsonResult, type ToolDefinition } from './shared.js';

type EspnStat = { name: string; value: number; displayValue: string };
type EspnEntry = {
  team: { id: string; abbreviation: string; displayName: string };
  stats: EspnStat[];
};
type EspnChild = { name: string; standings?: { entries: EspnEntry[] } };
type EspnStandingsResponse = { children: EspnChild[] };

type StandingsSeed = {
  season: string;
  seededAt: string;
  source: string;
  standings: Array<{
    teamId: number;
    abbrev: string;
    name: string;
    conference: string;
    wins: number;
    losses: number;
    winPct: number;
    gamesBack: number;
    streak: string;
  }>;
};

const inputSchema = {
  season: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .describe('Season start year: 2024 means the 2024-25 season. Live standings are always current; older seasons fall back to seed data.'),
} as const;

function statVal(entry: EspnEntry, name: string): number {
  return entry.stats.find((s) => s.name === name)?.value ?? 0;
}

function statDisplay(entry: EspnEntry, name: string): string {
  return entry.stats.find((s) => s.name === name)?.displayValue ?? '';
}

export function getStandings(client: NbaClient): ToolDefinition<typeof inputSchema> {
  return {
    name: 'get_standings',
    description:
      'NBA conference standings: wins, losses, win%, games back, streak — grouped by conference. Live source: ESPN. Historic seasons fall back to a committed seed snapshot (response includes `seededAt` when that path is used).',
    inputSchema,
    handler: async ({ season }) => {
      const currentSeason = new Date().getFullYear() - (new Date().getMonth() < 8 ? 1 : 0);
      const isCurrent = season === currentSeason;

      if (isCurrent) {
        const espn = await client.espn<EspnStandingsResponse>(
          '/standings',
          undefined,
          30 * 60 * 1000,
          'apis',
        );
        if (espn.ok) {
          const entries = (espn.data.children ?? []).flatMap((child) =>
            (child.standings?.entries ?? []).map((entry) => ({
              teamId: Number.parseInt(entry.team.id, 10),
              abbrev: entry.team.abbreviation,
              name: entry.team.displayName,
              conference: child.name,
              wins: statVal(entry, 'wins'),
              losses: statVal(entry, 'losses'),
              winPct: statVal(entry, 'winPercent'),
              gamesBack: statVal(entry, 'gamesBehind'),
              streak: statDisplay(entry, 'streak'),
            })),
          );
          return jsonResult({
            season,
            source: 'espn',
            count: entries.length,
            standings: entries,
          });
        }
      }

      const seasonSlug = `${season}-${String((season + 1) % 100).padStart(2, '0')}`;
      const seed = await client.seed<StandingsSeed>(`standings-${seasonSlug}.json`);
      if (seed.ok) {
        return jsonResult({
          season,
          source: 'seed',
          seededAt: seed.data.seededAt,
          count: seed.data.standings.length,
          standings: seed.data.standings,
        });
      }

      return errorResult(seed.error);
    },
  };
}
