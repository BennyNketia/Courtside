import { describe, expect, it } from 'vitest';

import { getPlayerSeasonAverages } from '../src/tools/get-player-season-averages.js';
import { makeClient, parseText } from './helpers.js';

describe('get_player_season_averages', () => {
  it('returns compact seed row for a player in the curated dataset', async () => {
    const client = makeClient(() => undefined);
    const result = await getPlayerSeasonAverages(client).handler({ player_id: 115, season: 2024 });
    expect(result.isError).toBeFalsy();
    const payload = parseText(result) as {
      season: number;
      seededAt: string;
      source: string;
      player: { id: number; name: string; pts: number };
    };
    expect(payload.season).toBe(2024);
    expect(payload.seededAt).toBeTruthy();
    expect(payload.player.id).toBe(115);
    expect(payload.player.name).toBe('Stephen Curry');
    expect(payload.player.pts).toBeGreaterThan(0);
  });

  it('returns structured error with availablePlayerIds for a missing player', async () => {
    const client = makeClient(() => undefined);
    const result = await getPlayerSeasonAverages(client).handler({ player_id: 999_999, season: 2024 });
    expect(result.isError).toBe(true);
    const payload = parseText(result) as { error: string; availablePlayerIds: number[] };
    expect(payload.error).toContain('curated dataset');
    expect(payload.availablePlayerIds.length).toBeGreaterThan(0);
  });
});
