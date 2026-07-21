import { describe, expect, it } from 'vitest';

import { name } from '../src/index.js';

describe('eval smoke', () => {
  it('exports its package name', () => {
    expect(name).toBe('@courtside/eval');
  });
});
