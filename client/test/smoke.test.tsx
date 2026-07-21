import { describe, expect, it } from 'vitest';

describe('client smoke', () => {
  it('runs Vitest in a jsdom environment', () => {
    expect(typeof window).toBe('object');
    expect(document.createElement('div').tagName).toBe('DIV');
  });
});
