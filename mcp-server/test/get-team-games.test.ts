import { describe, expect, it } from 'vitest';

import { getTeamGames } from '../src/tools/get-team-games.js';
import { makeClient, parseText } from './helpers.js';

function makeGame(date: string, home: number, away: number): unknown {
  return {
    id: Number(date.replace(/-/g, '')),
    date,
    season: 2024,
    status: 'Final',
    period: 4,
    time: null,
    postseason: false,
    home_team_score: home,
    visitor_team_score: away,
    home_team: { id: 14, abbreviation: 'LAL' },
    visitor_team: { id: 10, abbreviation: 'GSW' },
  };
}

describe('get_team_games', () => {
  it('returns compact rows sorted newest-first with last_n cap', async () => {
    const games = [
      makeGame('2025-01-15', 110, 108),
      makeGame('2025-01-14', 100, 102),
      makeGame('2025-01-13', 115, 99),
    ];
    const client = makeClient((url) => (url.includes('/games') ? { body: { data: games } } : undefined));
    const result = await getTeamGames(client).handler({ team_id: 14, season: 2024, last_n: 2 });
    const payload = parseText(result) as {
      games: Array<{ date: string; home: { score: number }; away: { score: number } }>;
    };
    expect(payload.games).toHaveLength(2);
    expect(payload.games[0]!.date).toBe('2025-01-15');
    expect(payload.games[1]!.date).toBe('2025-01-14');
  });

  it('regression: paginates via meta.next_cursor to reach the most recent games', async () => {
    // Simulate a team with 105 games in a season (playoff run). balldontlie
    // returns them ascending by date, 100 per page. Before the fix, the tool
    // only fetched page 1 and dropped the deepest playoff games.
    // page 1: dates 2024-10-01 … 2025-04-15 (100 games)
    // page 2: dates 2025-05-01 … 2025-06-20 (5 games — the Finals)
    const page1 = Array.from({ length: 100 }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = String(((i / 28) | 0) + 10).padStart(2, '0');
      return makeGame(`2024-${month}-${day}`, 100 + i, 90 + i);
    });
    const page2 = [
      makeGame('2025-06-20', 110, 108),
      makeGame('2025-06-15', 108, 105),
      makeGame('2025-06-10', 115, 102),
      makeGame('2025-06-05', 98, 110),
      makeGame('2025-05-30', 115, 100),
    ];

    let calls = 0;
    const client = makeClient((url) => {
      if (!url.includes('/games')) return undefined;
      calls += 1;
      if (url.includes('cursor=')) {
        return { body: { data: page2, meta: {} } };
      }
      return { body: { data: page1, meta: { next_cursor: 42 } } };
    });

    const result = await getTeamGames(client).handler({ team_id: 2, season: 2024, last_n: 3 });
    const payload = parseText(result) as {
      totalFetched: number;
      games: Array<{ date: string }>;
    };
    expect(calls).toBe(2); // paginated
    expect(payload.totalFetched).toBe(105);
    // The 3 most recent games must come from page 2 (the actual latest ones).
    expect(payload.games.map((g) => g.date)).toEqual(['2025-06-20', '2025-06-15', '2025-06-10']);
  });
});
