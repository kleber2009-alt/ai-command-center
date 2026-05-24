// Two logging concerns:
//   1. Human-readable console output (info/warn/error) for pm2 logs.
//   2. Structured, append-only audit of every Claude call to a JSONL file,
//      as required by the ТЗ (prompt, tokens, cost, latency).

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta && Object.keys(meta).length > 0) {
    stream(line, meta);
  } else {
    stream(line);
  }
}

export const log = {
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};

export interface ClaudeCallRecord {
  timestamp: string;
  promptFile?: string;
  model: string;
  attempts: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
  ok: boolean;
  error?: string;
}

const CALL_LOG_PATH = resolve(process.cwd(), 'data/logs/claude-calls.jsonl');

export async function recordClaudeCall(record: ClaudeCallRecord): Promise<void> {
  try {
    await mkdir(dirname(CALL_LOG_PATH), { recursive: true });
    await appendFile(CALL_LOG_PATH, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    // Audit logging must never break a pipeline run.
    log.warn('Failed to append Claude call record', { error: String(err) });
  }
}
