import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger as defaultLogger, type Logger } from './logger.js';
import { err, ok, type ClientDeps, type DataSource, type NbaError, type Result } from './types.js';

/**
 * The shared client every tool uses.
 *
 * Responsibilities:
 *   - per-source rate limiting (balldontlie ~5 req/min, espn ~1 req/sec)
 *   - correct headers per source (balldontlie needs Authorization; espn needs a browser-like UA)
 *   - TTL cache (per source + endpoint + params)
 *   - retry with exponential backoff + jitter on 429/5xx
 *   - stats.nba.com fallback → ESPN (not called at runtime under BULLETPROOF; see ADR-0001)
 *   - seed-file loading for stats-heavy tools
 *   - pre-warm-on-boot for a small set of common queries
 *
 * Contract: NEVER throws. Every public method returns Result<T>.
 * Tool handlers pattern-match on the ok flag and translate to MCP responses.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(HERE, '..', '..', 'data');

const BDL_BASE = 'https://api.balldontlie.io/v1';
const ESPN_SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const ESPN_APIS_BASE = 'https://site.api.espn.com/apis/v2/sports/basketball/nba';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';

type CacheEntry<T> = { value: T; expiresAt: number };

class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly now: () => number) {}

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  size(): number {
    return this.store.size;
  }

  stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.store.size };
  }
}

/**
 * Simple minimum-interval queued rate limiter.
 * Every call waits until enough wall-clock has passed since the previous call.
 * Serial by design — for a 5 req/min source that's exactly what we want.
 */
class RateLimiter {
  private lastRun = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly minIntervalMs: number,
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly now: () => number,
  ) {}

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.lastRun + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRun = this.now();
      return fn();
    };
    const chained = this.queue.then(run, run);
    this.queue = chained.catch(() => undefined);
    return chained;
  }
}

function stableParams(params: Record<string, unknown> | undefined): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) parts.push(`${k}[]=${encodeURIComponent(String(item))}`);
    } else {
      parts.push(`${k}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.join('&');
}

function buildUrl(base: string, endpoint: string, params?: Record<string, unknown>): string {
  const qs = stableParams(params);
  return qs ? `${base}${endpoint}?${qs}` : `${base}${endpoint}`;
}

function jitter(baseMs: number): number {
  return baseMs + Math.floor(Math.random() * baseMs * 0.5);
}

export type NbaClientStats = {
  cache: { hits: number; misses: number; size: number };
  balldontlie: { calls: number; failures: number };
  espn: { calls: number; failures: number };
  seed: { calls: number; failures: number };
  preWarm: { attempted: number; succeeded: number; ranAt: string | null };
};

type CallStats = { calls: number; failures: number };

export class NbaClient {
  private readonly fetch: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly dataDir: string;
  private readonly apiKey: string | undefined;
  private readonly log: Logger;

  private readonly cache: TtlCache;
  private readonly limiters: Record<DataSource, RateLimiter>;
  private readonly callStats: Record<DataSource, CallStats> = {
    balldontlie: { calls: 0, failures: 0 },
    espn: { calls: 0, failures: 0 },
    seed: { calls: 0, failures: 0 },
  };
  private preWarmStats: { attempted: number; succeeded: number; ranAt: string | null } = {
    attempted: 0,
    succeeded: 0,
    ranAt: null,
  };

  constructor(deps: ClientDeps = {}) {
    this.fetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = deps.now ?? (() => Date.now());
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.dataDir = deps.dataDir ?? DEFAULT_DATA_DIR;
    this.apiKey = deps.balldontlieApiKey ?? process.env.BALLDONTLIE_API_KEY;
    this.log = (deps.logger as Logger | undefined) ?? defaultLogger;

    this.cache = new TtlCache(this.now);
    this.limiters = {
      balldontlie: new RateLimiter(13_000, this.sleep, this.now),
      espn: new RateLimiter(1_000, this.sleep, this.now),
      seed: new RateLimiter(0, this.sleep, this.now),
    };
  }

  stats(): NbaClientStats {
    return {
      cache: this.cache.stats(),
      balldontlie: { ...this.callStats.balldontlie },
      espn: { ...this.callStats.espn },
      seed: { ...this.callStats.seed },
      preWarm: { ...this.preWarmStats },
    };
  }

  balldontlie<T = unknown>(
    endpoint: string,
    params: Record<string, unknown> | undefined,
    ttlMs: number,
  ): Promise<Result<T>> {
    if (!this.apiKey) {
      this.callStats.balldontlie.failures += 1;
      return Promise.resolve(err({ error: 'BALLDONTLIE_API_KEY is not set', retryable: false, source: 'balldontlie' }));
    }
    return this.fetchJson<T>('balldontlie', BDL_BASE, endpoint, params, ttlMs, {
      Authorization: this.apiKey,
      Accept: 'application/json',
    });
  }

  espn<T = unknown>(
    endpoint: string,
    params: Record<string, unknown> | undefined,
    ttlMs: number,
    base: 'site' | 'apis' = 'site',
  ): Promise<Result<T>> {
    const baseUrl = base === 'site' ? ESPN_SITE_BASE : ESPN_APIS_BASE;
    return this.fetchJson<T>('espn', baseUrl, endpoint, params, ttlMs, {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
    });
  }

  async seed<T = unknown>(filename: string): Promise<Result<T>> {
    this.callStats.seed.calls += 1;
    const filePath = path.resolve(this.dataDir, filename);
    const cached = this.cache.get<T>(`seed:${filePath}`);
    if (cached) return ok(cached);

    if (!existsSync(filePath)) {
      this.callStats.seed.failures += 1;
      return err({
        error: `seed file not found: ${filename}`,
        retryable: false,
        source: 'seed',
      });
    }
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as T;
      this.cache.set(`seed:${filePath}`, parsed, 24 * 60 * 60 * 1000);
      return ok(parsed);
    } catch (e) {
      this.callStats.seed.failures += 1;
      const message = e instanceof Error ? e.message : String(e);
      return err({ error: `failed to read seed: ${message}`, retryable: false, source: 'seed' });
    }
  }

  private async fetchJson<T>(
    source: DataSource,
    base: string,
    endpoint: string,
    params: Record<string, unknown> | undefined,
    ttlMs: number,
    headers: Record<string, string>,
  ): Promise<Result<T>> {
    const url = buildUrl(base, endpoint, params);
    const cacheKey = `${source}:${url}`;

    const cached = this.cache.get<T>(cacheKey);
    if (cached) return ok(cached);

    this.callStats[source].calls += 1;

    const attempt = async (n: number): Promise<Result<T>> => {
      let response: Response;
      try {
        response = await this.limiters[source].schedule(() =>
          this.doFetch(url, { headers, method: 'GET' }, 15_000),
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const retryable = /abort|timeout|network|fetch failed/i.test(message);
        if (retryable && n < 3) {
          await this.sleep(jitter(400 * 2 ** n));
          return attempt(n + 1);
        }
        this.callStats[source].failures += 1;
        return err({ error: `network error: ${message}`, retryable: true, source });
      }

      const status = response.status;
      if (status >= 500 || status === 429) {
        if (n < 3) {
          const retryAfterHeader = response.headers.get('retry-after');
          const retryAfterMs = retryAfterHeader
            ? Number.parseInt(retryAfterHeader, 10) * 1000
            : jitter(500 * 2 ** n);
          await this.sleep(Number.isFinite(retryAfterMs) ? retryAfterMs : jitter(500 * 2 ** n));
          return attempt(n + 1);
        }
        this.callStats[source].failures += 1;
        return err({
          error: `upstream ${source} returned ${status}`,
          retryable: true,
          status,
          source,
        });
      }
      if (status >= 400) {
        this.callStats[source].failures += 1;
        return err({
          error: `upstream ${source} returned ${status}`,
          retryable: false,
          status,
          source,
        });
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (e) {
        this.callStats[source].failures += 1;
        const message = e instanceof Error ? e.message : String(e);
        return err({ error: `invalid JSON from ${source}: ${message}`, retryable: false, source });
      }

      this.cache.set<T>(cacheKey, body as T, ttlMs);
      return ok(body as T);
    };

    return attempt(0);
  }

  private async doFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('request timeout')), timeoutMs);
    try {
      return await this.fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Pre-warm the cache with a small set of common queries.
   * Failures are logged but not fatal — the server still boots. This is the
   * primary mitigation for cold-cache latency on Render's free tier.
   */
  async preWarm(): Promise<void> {
    const tasks: Array<{ label: string; run: () => Promise<Result<unknown>> }> = [
      { label: 'balldontlie /teams', run: () => this.balldontlie('/teams', undefined, 24 * 60 * 60 * 1000) },
      { label: 'espn /scoreboard', run: () => this.espn('/scoreboard', undefined, 30_000) },
      { label: 'espn /standings', run: () => this.espn('/standings', undefined, 30 * 60 * 1000, 'apis') },
    ];
    this.preWarmStats = { attempted: tasks.length, succeeded: 0, ranAt: new Date(this.now()).toISOString() };
    for (const task of tasks) {
      try {
        const result = await task.run();
        if (result.ok) {
          this.preWarmStats.succeeded += 1;
        } else {
          this.log.warn('pre-warm task failed', { label: task.label, error: result.error });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.log.warn('pre-warm task threw', { label: task.label, message });
      }
    }
    this.log.info('pre-warm complete', this.preWarmStats);
  }
}

export type { NbaError, Result };
