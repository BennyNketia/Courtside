import { z } from 'zod';

import type { NbaClient } from '../lib/nba-client.js';
import { errorResult, jsonResult, type ToolDefinition } from './shared.js';

type BdlTeam = {
  id: number;
  abbreviation: string;
  city: string;
  full_name: string;
  conference: string;
  division: string;
};
type BdlTeamsResponse = { data: BdlTeam[] };

type EspnTeamsResponse = {
  sports: Array<{
    leagues: Array<{
      teams: Array<{
        team: {
          id: string;
          abbreviation: string;
          displayName: string;
          location: string;
          color?: string;
        };
      }>;
    }>;
  }>;
};

const inputSchema = {
  query: z
    .string()
    .min(1)
    .describe('Team lookup: full name (e.g. "Los Angeles Lakers"), city ("Boston"), or 3-letter abbreviation ("GSW"). Case-insensitive.'),
} as const;

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function getTeam(client: NbaClient): ToolDefinition<typeof inputSchema> {
  return {
    name: 'get_team',
    description:
      'Look up an NBA team by name, city, or 3-letter abbreviation. Returns id, abbrev, city, name, conference, division. Source: balldontlie free tier (ESPN fallback).',
    inputSchema,
    handler: async ({ query }) => {
      const q = normalize(query);

      const bdl = await client.balldontlie<BdlTeamsResponse>(
        '/teams',
        undefined,
        24 * 60 * 60 * 1000,
      );
      if (bdl.ok) {
        const teams = bdl.data.data ?? [];
        const match = teams.find(
          (t) =>
            normalize(t.abbreviation) === q ||
            normalize(t.full_name) === q ||
            normalize(t.city) === q ||
            normalize(t.full_name).includes(q) ||
            normalize(t.city).includes(q),
        );
        if (match) {
          return jsonResult({
            source: 'balldontlie',
            team: {
              id: match.id,
              abbrev: match.abbreviation,
              city: match.city,
              name: match.full_name,
              conference: match.conference,
              division: match.division,
            },
          });
        }
      }

      const espn = await client.espn<EspnTeamsResponse>('/teams', undefined, 24 * 60 * 60 * 1000);
      if (espn.ok) {
        const teams = espn.data.sports?.[0]?.leagues?.[0]?.teams ?? [];
        const match = teams.find(({ team }) => {
          const abbrev = normalize(team.abbreviation);
          const name = normalize(team.displayName);
          const city = normalize(team.location);
          return abbrev === q || name === q || city === q || name.includes(q) || city.includes(q);
        });
        if (match) {
          return jsonResult({
            source: 'espn',
            team: {
              id: Number.parseInt(match.team.id, 10),
              abbrev: match.team.abbreviation,
              city: match.team.location,
              name: match.team.displayName,
              conference: null,
              division: null,
            },
          });
        }
      }

      if (!bdl.ok && !espn.ok) return errorResult(bdl.error);

      return errorResult({
        error: `no team matched "${query}"`,
        retryable: false,
        source: 'balldontlie',
      });
    },
  };
}
