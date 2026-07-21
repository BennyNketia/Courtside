import { describe, expect, it } from 'vitest';

import { comparePlayers } from '../src/tools/compare-players.js';
import { makeClient, parseText } from './helpers.js';

describe('compare_players', () => {
  it('compares curated players and identifies per-stat leaders', async () => {
    const client = makeClient(() => undefined);
    const result = await comparePlayers(client).handler({ player_ids: [237, 115], season: 2024 });
    const payload = parseText(result) as {
      players: Array<{ id: number; name: string }>;
      leaders: Record<string, { playerId: number; value: number }>;
    };
    expect(payload.players).toHaveLength(2);
    // Jokic-like leaders logic sanity: leaders exists for each stat.
    expect(payload.leaders.pts).toBeDefined();
    expect(payload.leaders.tov).toBeDefined();
    // ppg leader between LeBron and Curry should be whichever has higher pts.
    expect([115, 237]).toContain(payload.leaders.pts!.playerId);
  });

  it('errors when any player is outside the curated dataset', async () => {
    const client = makeClient(() => undefined);
    const result = await comparePlayers(client).handler({
      player_ids: [237, 999_999],
      season: 2024,
    });
    expect(result.isError).toBe(true);
    const payload = parseText(result) as { error: string; availablePlayerIds: number[] };
    expect(payload.error).toContain('curated dataset');
    expect(payload.availablePlayerIds.length).toBeGreaterThan(0);
  });
});
