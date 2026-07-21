import { describe, expect, it } from 'vitest';

import { name } from '../src/index.js';

describe('runtime smoke', () => {
  it('exports its package name', () => {
    expect(name).toBe('@courtside/runtime');
  });
});
