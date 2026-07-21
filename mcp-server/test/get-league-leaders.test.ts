import { describe, expect, it } from 'vitest';

import { getLeagueLeaders } from '../src/tools/get-league-leaders.js';
import { makeClient, parseText } from './helpers.js';

describe('get_league_leaders', () => {
  it('returns top-N compact rows for a stat/season pair', async () => {
    const client = makeClient(() => undefined);
    const result = await getLeagueLeaders(client).handler({ stat: 'pts', season: 2024, limit: 3 });
    const payload = parseText(result) as {
      season: number;
      stat: string;
      seededAt: string;
      count: number;
      leaders: Array<{ rank: number; name: string; value: number }>;
    };
    expect(payload.stat).toBe('pts');
    expect(payload.count).toBe(3);
    expect(payload.leaders[0]!.rank).toBe(1);
  });
});
