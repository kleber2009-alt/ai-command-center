import 'dotenv/config';

import type { LogLevel } from './logger.js';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : undefined;
}

function parseIds(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`Invalid port: ${raw}`);
  return n;
}

function parseThreshold(raw: string | undefined): number {
  if (!raw) return 0.7;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error(`CONFIDENCE_THRESHOLD must be in [0,1], got: ${raw}`);
  }
  return n;
}

function parseLogLevel(raw: string | undefined): LogLevel {
  const v = (raw ?? 'info').toLowerCase();
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') return v;
  throw new Error(`Invalid LOG_LEVEL: ${raw}`);
}

function parseHourUtc(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 23) {
    throw new Error(`DIGEST_DAILY_HOUR_UTC must be 0..23, got: ${raw}`);
  }
  return n;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Expected positive integer, got: ${raw}`);
  }
  return n;
}

export interface Config {
  // SendPulse
  sendPulseClientId: string;
  sendPulseClientSecret: string;
  sendPulseBotId: string | undefined;
  sendPulseWebhookToken: string;

  // Anthropic
  anthropicApiKey: string;
  responderModel: string;
  classifierModel: string;
  analystModel: string;

  // Postgres
  databaseUrl: string;

  // Owner notifications (reused tg-agent bot)
  telegramBotToken: string;
  ownerTelegramId: number;

  // Admin
  adminPort: number;
  adminPublicUrl: string | undefined;
  adminSessionSecret: string | undefined;
  adminUsername: string | undefined;
  adminPassword: string | undefined;
  // Shared secret used by the aisales dashboard reverse-proxy (Caddy
  // header_up X-Internal-Auth) so /api/* can be reached without the
  // magic-link cookie when called from the dashboard origin.
  internalApiToken: string | undefined;

  // Behavior
  logLevel: LogLevel;
  confidenceThreshold: number;
  ignoredContactIds: Set<string>;

  // Daily digest scheduler
  digestModel: string;
  digestDailyHourUtc: number;
  digestWindowHours: number;
}

export function loadConfig(): Config {
  const ownerRaw = required('OWNER_TELEGRAM_ID');
  const ownerTelegramId = Number(ownerRaw);
  if (!Number.isInteger(ownerTelegramId)) {
    throw new Error(`OWNER_TELEGRAM_ID must be an integer, got: ${ownerRaw}`);
  }
  return {
    sendPulseClientId: required('SENDPULSE_CLIENT_ID'),
    sendPulseClientSecret: required('SENDPULSE_CLIENT_SECRET'),
    sendPulseBotId: optional('SENDPULSE_BOT_ID'),
    sendPulseWebhookToken: required('SENDPULSE_WEBHOOK_TOKEN'),

    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    responderModel: optional('RESPONDER_MODEL') ?? 'claude-haiku-4-5-20251001',
    classifierModel: optional('CLASSIFIER_MODEL') ?? 'claude-haiku-4-5-20251001',
    analystModel: optional('ANALYST_MODEL') ?? 'claude-sonnet-4-6',

    databaseUrl: required('DATABASE_URL'),

    telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
    ownerTelegramId,

    adminPort: parsePort(process.env.ADMIN_PORT, 8081),
    adminPublicUrl: optional('ADMIN_PUBLIC_URL'),
    adminSessionSecret: optional('ADMIN_SESSION_SECRET'),
    adminUsername: optional('ADMIN_USERNAME'),
    adminPassword: optional('ADMIN_PASSWORD'),
    internalApiToken: optional('INTERNAL_API_TOKEN'),

    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    confidenceThreshold: parseThreshold(process.env.CONFIDENCE_THRESHOLD),
    ignoredContactIds: parseIds(process.env.IGNORED_CONTACT_IDS),

    // Daily digest. Default 03 UTC = 10:00 Asia/Jakarta. Default window 24h.
    digestModel:
      optional('DIGEST_MODEL') ??
      optional('ANALYST_MODEL') ??
      'claude-sonnet-4-6',
    digestDailyHourUtc: parseHourUtc(process.env.DIGEST_DAILY_HOUR_UTC, 3),
    digestWindowHours: parsePositiveInt(process.env.DIGEST_WINDOW_HOURS, 24),
  };
}
