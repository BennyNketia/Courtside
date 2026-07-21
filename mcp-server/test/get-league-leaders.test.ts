import path from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
    // Value must be monotonically non-increasing.
    for (let i = 1; i < payload.leaders.length; i += 1) {
      expect(payload.leaders[i]!.value).toBeLessThanOrEqual(payload.leaders[i - 1]!.value);
    }
  });

  describe('regression: seed rows in wrong order', () => {
    // Fabricate a seed where file order disagrees with value ordering (the
    // exact pattern found in the pre-fix real seeds). The handler must still
    // return the true top-N by value.
    const tmpDir = path.join(os.tmpdir(), `courtside-leaders-test-${process.pid}`);
    beforeAll(() => {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(
        path.join(tmpDir, 'leaders-2024-25-fg3m.json'),
        JSON.stringify({
          season: '2024-25',
          stat: 'fg3m',
          seededAt: '2026-07-20T00:00:00Z',
          source: 'test',
          leaders: [
            { rank: 1, playerId: 100, name: 'Alpha', teamAbbrev: 'AAA', value: 3.3, gp: 70 },
            { rank: 2, playerId: 200, name: 'Bravo', teamAbbrev: 'BBB', value: 3.4, gp: 70 },
            { rank: 3, playerId: 300, name: 'Charlie', teamAbbrev: 'CCC', value: 2.0, gp: 70 },
            { rank: 4, playerId: 400, name: 'Delta', teamAbbrev: 'DDD', value: 4.5, gp: 70 },
          ],
        }),
      );
    });
    afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

    it('sorts by value desc and re-emits ranks defensively', async () => {
      const client = makeClient(() => undefined, { dataDir: tmpDir });
      const result = await getLeagueLeaders(client).handler({
        stat: 'fg3m',
        season: 2024,
        limit: 3,
      });
      const payload = parseText(result) as {
        leaders: Array<{ name: string; rank: number; value: number }>;
      };
      expect(payload.leaders.map((r) => r.name)).toEqual(['Delta', 'Bravo', 'Alpha']);
      expect(payload.leaders.map((r) => r.rank)).toEqual([1, 2, 3]);
      expect(payload.leaders[0]!.value).toBe(4.5);
    });
  });
});
