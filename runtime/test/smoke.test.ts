import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { name } from '../src/index.js';

describe('runtime smoke', () => {
  it('exports its package name', () => {
    expect(name).toBe('@courtside/runtime');
  });

  it('loadConfig fills in dev defaults', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3002);
    expect(config.clientOrigin).toBe('http://localhost:5173');
    expect(config.mcp.serverUrl).toBe('http://localhost:3001/mcp');
    expect(config.agent.maxIterations).toBe(8);
    expect(config.agent.timeoutMs).toBe(60000);
    expect(config.rateLimit.max).toBe(10);
  });

  it('loadConfig respects env overrides', () => {
    const config = loadConfig({
      PORT: '9999',
      AGENT_MAX_ITERATIONS: '3',
      AGENT_TIMEOUT_MS: '1234',
      RATE_LIMIT_MAX: '2',
      RATE_LIMIT_WINDOW_MS: '500',
    } as NodeJS.ProcessEnv);
    expect(config.port).toBe(9999);
    expect(config.agent.maxIterations).toBe(3);
    expect(config.agent.timeoutMs).toBe(1234);
    expect(config.rateLimit.max).toBe(2);
    expect(config.rateLimit.windowMs).toBe(500);
  });
});
