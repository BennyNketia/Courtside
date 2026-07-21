import { describe, expect, it } from 'vitest';

import { getTeam } from '../src/tools/get-team.js';
import { makeClient, parseText } from './helpers.js';

const BDL_TEAMS = {
  data: [
    { id: 14, abbreviation: 'LAL', city: 'Los Angeles', full_name: 'Los Angeles Lakers', conference: 'West', division: 'Pacific' },
    { id: 10, abbreviation: 'GSW', city: 'Golden State', full_name: 'Golden State Warriors', conference: 'West', division: 'Pacific' },
  ],
};

describe('get_team', () => {
  it('matches on abbreviation', async () => {
    const client = makeClient((url) => (url.includes('/teams') ? { body: BDL_TEAMS } : undefined));
    const result = await getTeam(client).handler({ query: 'gsw' });
    const payload = parseText(result) as { source: string; team: { id: number; abbrev: string } };
    expect(payload.source).toBe('balldontlie');
    expect(payload.team).toEqual(expect.objectContaining({ id: 10, abbrev: 'GSW' }));
  });

  it('falls back to ESPN when balldontlie yields no match', async () => {
    const espnBody = {
      sports: [
        {
          leagues: [
            {
              teams: [
                {
                  team: { id: '13', abbreviation: 'LAC', displayName: 'LA Clippers', location: 'Los Angeles' },
                },
              ],
            },
          ],
        },
      ],
    };
    const client = makeClient((url) => {
      if (url.includes('balldontlie.io/v1/teams')) return { body: { data: [] } };
      if (url.includes('site.api.espn.com') && url.includes('/teams')) return { body: espnBody };
      return undefined;
    });
    const result = await getTeam(client).handler({ query: 'clippers' });
    const payload = parseText(result) as { source: string; team: { id: number; abbrev: string } };
    expect(payload.source).toBe('espn');
    expect(payload.team.abbrev).toBe('LAC');
  });

  it('returns isError when no source has a match', async () => {
    const client = makeClient((url) => {
      if (url.includes('balldontlie.io')) return { body: { data: [] } };
      if (url.includes('site.api.espn.com')) return { body: { sports: [{ leagues: [{ teams: [] }] }] } };
      return undefined;
    });
    const result = await getTeam(client).handler({ query: 'nonesuch' });
    expect(result.isError).toBe(true);
  });

  it('regression: short ambiguous query "LA" does NOT match Atlanta via substring', async () => {
    // The old handler used a single Array.find OR'd with .includes(), so "LA"
    // matched "Atlanta" (id=1) before iteration reached LAC/LAL. The fix
    // requires MIN_SUBSTRING_LEN (4) for substring matches; "LA" (2 chars)
    // must fall through to a structured error.
    const client = makeClient((url) => {
      if (url.includes('balldontlie.io/v1/teams')) return { body: BDL_TEAMS };
      if (url.includes('site.api.espn.com') && url.includes('/teams'))
        return { body: { sports: [{ leagues: [{ teams: [] }] }] } };
      return undefined;
    });
    const result = await getTeam(client).handler({ query: 'LA' });
    expect(result.isError).toBe(true);
    const payload = parseText(result) as { error: string };
    expect(payload.error).toContain('no exact team match');
  });

  it('regression: exact abbrev "LAC" still resolves cleanly', async () => {
    const bdlWithLAC = {
      data: [
        ...BDL_TEAMS.data,
        { id: 13, abbreviation: 'LAC', city: 'LA', full_name: 'LA Clippers', conference: 'West', division: 'Pacific' },
      ],
    };
    const client = makeClient((url) =>
      url.includes('/teams') ? { body: bdlWithLAC } : undefined,
    );
    const result = await getTeam(client).handler({ query: 'LAC' });
    const payload = parseText(result) as { team: { abbrev: string } };
    expect(payload.team.abbrev).toBe('LAC');
  });
});
