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

  it('returns isError when the seed for a historic season is missing', async () => {
    const client = makeClient(() => undefined, { dataDir: '/no/such/dir' });
    const result = await getStandings(client).handler({ season: 1999 });
    expect(result.isError).toBe(true);
  });
});
