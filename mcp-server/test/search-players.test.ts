import { describe, expect, it } from 'vitest';

import { searchPlayers } from '../src/tools/search-players.js';
import { makeClient, parseText } from './helpers.js';

const CURRY = {
  id: 115,
  first_name: 'Stephen',
  last_name: 'Curry',
  position: 'G',
  height: '6-2',
  weight: '185',
  team: { id: 10, abbreviation: 'GSW', full_name: 'Golden State Warriors' },
};

describe('search_players', () => {
  it('returns compact top-5 rows', async () => {
    const client = makeClient((url) => {
      if (url.includes('/players') && url.includes('search=curry')) {
        return { body: { data: [CURRY] } };
      }
      return undefined;
    });
    const tool = searchPlayers(client);
    const result = await tool.handler({ name: 'curry' });
    expect(result.isError).toBeFalsy();
    const payload = parseText(result) as { players: Array<{ id: number; name: string }> };
    expect(payload.players[0]).toEqual({
      id: 115,
      name: 'Stephen Curry',
      position: 'G',
      height: '6-2',
      weight: '185',
      team: { id: 10, abbrev: 'GSW', name: 'Golden State Warriors' },
    });
  });

  it('surfaces upstream errors as isError=true', async () => {
    const client = makeClient(() => ({ status: 500, body: {} }));
    const tool = searchPlayers(client);
    const result = await tool.handler({ name: 'curry' });
    expect(result.isError).toBe(true);
  });
});
