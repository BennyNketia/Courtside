import { describe, expect, it } from 'vitest';

import { getStandings } from '../src/tools/get-standings.js';
import { makeClient, parseText } from './helpers.js';

const ESPN_STANDINGS = {
  children: [
    {
      name: 'Eastern Conference',
      standings: {
        entries: [
          {
            team: { id: '2', abbreviation: 'BOS', displayName: 'Boston Celtics' },
            stats: [
              { name: 'wins', value: 22, displayValue: '22' },
              { name: 'losses', value: 8, displayValue: '8' },
              { name: 'winPercent', value: 0.733, displayValue: '.733' },
              { name: 'gamesBehind', value: 0, displayValue: '-' },
              { name: 'streak', value: 3, displayValue: 'W3' },
            ],
          },
        ],
      },
    },
  ],
};

describe('get_standings', () => {
  it('returns ESPN-sourced standings for the current season', async () => {
    const client = makeClient((url) =>
      url.includes('/standings') ? { body: ESPN_STANDINGS } : undefined,
    );
    const currentSeason = new Date().getFullYear() - (new Date().getMonth() < 8 ? 1 : 0);
    const result = await getStandings(client).handler({ season: currentSeason });
    const payload = parseText(result) as {
      source: string;
      standings: Array<{ abbrev: string; wins: number; streak: string }>;
    };
    expect(payload.source).toBe('espn');
    expect(payload.standings[0]).toEqual(
      expect.objectContaining({ abbrev: 'BOS', wins: 22, streak: 'W3' }),
    );
  });

  it('prefers the committed seed over ESPN for the season it exists — never mislabels', async () => {
    // Regression for the "±1 window" bug: ESPN /standings has no season
    // selector, so querying for a historic season and getting ESPN's current
    // dump back would mislabel it. Seed-first prevents that.
    const espnCalled: string[] = [];
    const client = makeClient((url) => {
      if (url.includes('site.api.espn.com') && url.includes('/standings')) {
        espnCalled.push(url);
        return { body: ESPN_STANDINGS };
      }
      return undefined;
    });
    const result = await getStandings(client).handler({ season: 2024 });
    const payload = parseText(result) as { source: string; seededAt: string; season: number };
    expect(payload.source).toBe('seed');
    expect(payload.seededAt).toBeTruthy();
    expect(payload.season).toBe(2024);
    expect(espnCalled).toEqual([]); // ESPN never called for a seeded season
  });

  it('returns isError when both the seed and ESPN yield nothing', async () => {
    const client = makeClient(() => undefined, { dataDir: '/no/such/dir' });
    const result = await getStandings(client).handler({ season: 1999 });
    expect(result.isError).toBe(true);
  });
});
