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

const MIN_SUBSTRING_LEN = 4;

type Candidate = {
  id: number;
  abbrev: string;
  city: string;
  name: string;
  conference: string | null;
  division: string | null;
};

/**
 * Two-pass matcher:
 *   1. Exact match on abbreviation, city, or full name across ALL candidates.
 *      If exactly one matches → return it. If more than one → we still return
 *      the first (there are no legitimate duplicate abbrevs in the NBA), but
 *      exact-mode NEVER lets a short substring hijack the result.
 *   2. Substring match ONLY if the query is ≥ MIN_SUBSTRING_LEN chars long.
 *      This keeps "LA" / "or" / "in" from matching Atlanta / Detroit /
 *      Indiana — those are ambiguous by design and should require the caller
 *      to disambiguate (e.g. "LAC" or "Lakers").
 */
function findTeam(q: string, candidates: Candidate[]): Candidate | undefined {
  const exact = candidates.find(
    (c) => normalize(c.abbrev) === q || normalize(c.name) === q || normalize(c.city) === q,
  );
  if (exact) return exact;

  if (q.length < MIN_SUBSTRING_LEN) return undefined;

  return candidates.find(
    (c) => normalize(c.name).includes(q) || normalize(c.city).includes(q),
  );
}

export function getTeam(client: NbaClient): ToolDefinition<typeof inputSchema> {
  return {
    name: 'get_team',
    description:
      'Look up an NBA team by full name, city, or 3-letter abbreviation. Returns id, abbrev, city, name, conference, division. Ambiguous short queries (e.g. "LA") must be disambiguated by the caller as "LAC"/"LAL" or "Lakers"/"Clippers" — the tool will not guess. Source: balldontlie free tier (ESPN fallback).',
    inputSchema,
    handler: async ({ query }) => {
      const q = normalize(query);

      const bdl = await client.balldontlie<BdlTeamsResponse>(
        '/teams',
        undefined,
        24 * 60 * 60 * 1000,
      );
      if (bdl.ok) {
        const candidates: Candidate[] = (bdl.data.data ?? []).map((t) => ({
          id: t.id,
          abbrev: t.abbreviation,
          city: t.city,
          name: t.full_name,
          conference: t.conference,
          division: t.division,
        }));
        const match = findTeam(q, candidates);
        if (match) {
          return jsonResult({ source: 'balldontlie', team: match });
        }
      }

      const espn = await client.espn<EspnTeamsResponse>('/teams', undefined, 24 * 60 * 60 * 1000);
      if (espn.ok) {
        const candidates: Candidate[] = (espn.data.sports?.[0]?.leagues?.[0]?.teams ?? []).map(
          ({ team }) => ({
            id: Number.parseInt(team.id, 10),
            abbrev: team.abbreviation,
            city: team.location,
            name: team.displayName,
            conference: null,
            division: null,
          }),
        );
        const match = findTeam(q, candidates);
        if (match) {
          return jsonResult({ source: 'espn', team: match });
        }
      }

      if (!bdl.ok && !espn.ok) return errorResult(bdl.error);

      return errorResult({
        error:
          q.length < MIN_SUBSTRING_LEN
            ? `no exact team match for "${query}" — use a full name (e.g. "Los Angeles Lakers"), city ("Boston"), or abbreviation ("LAC")`
            : `no team matched "${query}"`,
        retryable: false,
        source: 'balldontlie',
      });
    },
  };
}
