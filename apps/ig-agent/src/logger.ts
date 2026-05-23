// Tiny structured logger. Same JSON shape as tg-agent's so log aggregation
// works uniformly across both bots.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(level: LogLevel = 'info'): Logger {
  const threshold = LEVELS[level];
  const emit = (lvl: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (LEVELS[lvl] < threshold) return;
    const entry = {
      ts: new Date().toISOString(),
      level: lvl,
      msg,
      ...(meta ?? {}),
    };
    const stream = lvl === 'error' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
  };
  return {
    debug: (m, x) => emit('debug', m, x),
    info: (m, x) => emit('info', m, x),
    warn: (m, x) => emit('warn', m, x),
    error: (m, x) => emit('error', m, x),
  };
}
