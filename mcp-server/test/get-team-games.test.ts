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
});
