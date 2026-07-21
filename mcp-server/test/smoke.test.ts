import { describe, expect, it } from 'vitest';

import { name } from '../src/index.js';

describe('mcp-server smoke', () => {
  it('exports its package name', () => {
    expect(name).toBe('@courtside/mcp-server');
  });
});
