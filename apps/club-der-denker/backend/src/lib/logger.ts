/**
 * Structured JSON logging to stdout (collected by Docker / the platform).
 * Pragmatic production-observability baseline; for error aggregation set
 * SENTRY_DSN and forward `error` lines, or swap in @sentry/nextjs.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...ctx });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, ctx),
};
