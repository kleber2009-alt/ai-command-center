// Minimal structured logger. JSON to stdout — pipes into Docker logs cleanly
// and gets parsed by any log aggregator. No external dep.

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? LEVELS.info;

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (LEVELS[level] < min) return;
  const entry = {
    t: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  };
  const line = JSON.stringify(entry);
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export function child(scope: string) {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, { scope, ...ctx }),
    info:  (msg: string, ctx?: Record<string, unknown>) => emit("info",  msg, { scope, ...ctx }),
    warn:  (msg: string, ctx?: Record<string, unknown>) => emit("warn",  msg, { scope, ...ctx }),
    error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, { scope, ...ctx }),
  };
}

export const log = child("app");
