import { z } from 'zod';

import type { NbaClient } from '../lib/nba-client.js';
import { errorResult, jsonResult, type ToolDefinition } from './shared.js';

type EspnCompetitor = {
  homeAway: 'home' | 'away';
  score: string;
  team: { abbreviation: string; displayName: string };
  records?: Array<{ summary: string }>;
};

type EspnEvent = {
  id: string;
  date: string;
  status: { type: { shortDetail: string; state: string } };
  competitions: Array<{ competitors: EspnCompetitor[] }>;
};

type EspnScoreboardResponse = { events: EspnEvent[] };

const inputSchema = {
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('ISO date (YYYY-MM-DD). Defaults to today (US Eastern).'),
} as const;

function toEspnDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function todayEasternIso(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

export function getScoreboard(client: NbaClient): ToolDefinition<typeof inputSchema> {
  return {
    name: 'get_scoreboard',
    description:
      'NBA scoreboard: games and scores for a single date (defaults to today, US Eastern). Returns compact per-game rows. Source: ESPN public JSON.',
    inputSchema,
    handler: async ({ date }) => {
      const iso = date ?? todayEasternIso();
      const espnDate = toEspnDate(iso);

      const result = await client.espn<EspnScoreboardResponse>(
        '/scoreboard',
        { dates: espnDate },
        30_000,
      );
      if (!result.ok) return errorResult(result.error);

      const events = result.data.events ?? [];
      const games = events.map((ev) => {
        const competitors = ev.competitions?.[0]?.competitors ?? [];
        const home = competitors.find((c) => c.homeAway === 'home');
        const away = competitors.find((c) => c.homeAway === 'away');
        const shape = (c: EspnCompetitor | undefined) =>
          c
            ? {
                abbrev: c.team.abbreviation,
                name: c.team.displayName,
                score: Number.parseInt(c.score, 10),
                record: c.records?.[0]?.summary ?? null,
              }
            : null;
        return {
          id: ev.id,
          date: ev.date,
          status: ev.status?.type?.shortDetail ?? 'unknown',
          state: ev.status?.type?.state ?? 'unknown',
          home: shape(home),
          away: shape(away),
        };
      });

      return jsonResult({ date: iso, source: 'espn', count: games.length, games });
    },
  };
}
