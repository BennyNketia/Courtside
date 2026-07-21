import { describe, expect, it } from 'vitest';

import { getScoreboard } from '../src/tools/get-scoreboard.js';
import { makeClient, parseText } from './helpers.js';

describe('get_scoreboard', () => {
  it('flattens ESPN events into compact per-game rows', async () => {
    const espn = {
      events: [
        {
          id: '4019',
          date: '2026-01-04T00:00Z',
          status: { type: { shortDetail: 'Final', state: 'post' } },
          competitions: [
            {
              competitors: [
                { homeAway: 'home', score: '112', team: { abbreviation: 'BOS', displayName: 'Boston Celtics' }, records: [{ summary: '22-8' }] },
                { homeAway: 'away', score: '108', team: { abbreviation: 'MIA', displayName: 'Miami Heat' }, records: [{ summary: '16-14' }] },
              ],
            },
          ],
        },
      ],
    };
    const client = makeClient((url) =>
      url.includes('site.api.espn.com') && url.includes('/scoreboard') ? { body: espn } : undefined,
    );
    const result = await getScoreboard(client).handler({ date: '2026-01-03' });
    const payload = parseText(result) as {
      date: string;
      games: Array<{ home: { abbrev: string; score: number }; away: { abbrev: string; score: number } }>;
    };
    expect(payload.date).toBe('2026-01-03');
    expect(payload.games[0]!.home).toEqual(expect.objectContaining({ abbrev: 'BOS', score: 112 }));
    expect(payload.games[0]!.away).toEqual(expect.objectContaining({ abbrev: 'MIA', score: 108 }));
  });
});
