export type NbaError = {
  error: string;
  retryable: boolean;
  status?: number | undefined;
  source?: DataSource | undefined;
  availablePlayerIds?: number[] | undefined;
};

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: NbaError };
export type Result<T> = Ok<T> | Err;

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
export const err = (error: NbaError): Err => ({ ok: false, error });

export type DataSource = 'balldontlie' | 'espn' | 'seed';

export type SeasonAveragesSeed = {
  season: string;
  seededAt: string;
  source: string;
  players: Array<{
    playerId: number;
    name: string;
    teamAbbrev: string;
    gp: number;
    min: number;
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    fgPct: number;
    fg3Pct: number;
    ftPct: number;
    tov: number;
  }>;
};

export type LeagueLeadersSeed = {
  season: string;
  stat: string;
  seededAt: string;
  source: string;
  leaders: Array<{
    rank: number;
    playerId: number;
    name: string;
    teamAbbrev: string;
    value: number;
    gp: number;
  }>;
};

export type FetchOptions = {
  timeoutMs?: number;
  retries?: number;
};

export type ClientDeps = {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  dataDir?: string;
  balldontlieApiKey?: string;
  logger?: { info: (msg: string, meta?: unknown) => void; warn: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
};
