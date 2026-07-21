// Structured JSON logger — same shape as the MCP server so a combined tail
// of both processes stays diffable. No pino dep to keep the bundle small.

type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 };

const envLevel = (process.env.LOG_LEVEL as Level | undefined) ?? 'info';
const threshold = ORDER[envLevel] ?? ORDER.info;

function emit(level: Level, msg: string, meta?: unknown): void {
  if (ORDER[level] < threshold) return;
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta && typeof meta === 'object' ? meta : { meta }),
  };
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(JSON.stringify(line) + '\n');
}

export const logger = {
  trace: (msg: string, meta?: unknown) => emit('trace', msg, meta),
  debug: (msg: string, meta?: unknown) => emit('debug', msg, meta),
  info: (msg: string, meta?: unknown) => emit('info', msg, meta),
  warn: (msg: string, meta?: unknown) => emit('warn', msg, meta),
  error: (msg: string, meta?: unknown) => emit('error', msg, meta),
};

export type Logger = typeof logger;
