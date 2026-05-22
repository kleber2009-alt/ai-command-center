import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

function parseChatIds(raw: string | undefined): Set<number> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const n = Number(s);
        if (!Number.isFinite(n)) {
          throw new Error(`Invalid chat id in ALLOWED_CHAT_IDS: ${s}`);
        }
        return n;
      }),
  );
}

function parseThreshold(raw: string | undefined): number {
  if (!raw) return 0.7;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error(`CONFIDENCE_THRESHOLD must be a number in [0, 1], got: ${raw}`);
  }
  return n;
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }
  return n;
}

function parseHours(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`BACKUP_INTERVAL_HOURS must be ≥ 0, got: ${raw}`);
  }
  return n;
}

function parseHourOfDay(name: string, raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 23) {
    throw new Error(`${name} must be an integer 0..23, got: ${raw}`);
  }
  return n;
}

function parseWindowHours(name: string, raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 168) {
    throw new Error(`${name} must be in [1, 168] hours, got: ${raw}`);
  }
  return n;
}

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  return n;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function parseLogLevel(raw: string | undefined): LogLevel {
  const v = (raw ?? 'info').toLowerCase();
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') return v;
  throw new Error(`Invalid LOG_LEVEL: ${raw}`);
}

export interface Config {
  telegramBotToken: string;
  anthropicApiKey: string;
  ownerTelegramId: number | undefined;
  allowedChatIds: Set<number>;
  confidenceThreshold: number;
  logLevel: LogLevel;
  classifierModel: string;
  responderModel: string;
  digestModel: string;
  // 0..23 — UTC hour for the daily digest sweep. 6 = 09:00 MSK.
  digestDailyHourUtc: number;
  // Rolling window (hours) for each daily digest.
  digestWindowHours: number;
  // Enable/disable both the scheduler and the on-demand commands.
  digestEnabled: boolean;
  databasePath: string;
  adminPort: number;
  adminUsername: string;
  adminPassword: string | undefined;
  adminSessionSecret: string | undefined;
  adminPublicUrl: string | undefined;
  backupIntervalHours: number;
  healthFailureThreshold: number;
  healthAlertCooldownMinutes: number;
}

export function loadConfig(): Config {
  const ownerRaw = optional('OWNER_TELEGRAM_ID');
  const ownerTelegramId = ownerRaw ? Number(ownerRaw) : undefined;
  if (ownerRaw && !Number.isFinite(ownerTelegramId)) {
    throw new Error(`OWNER_TELEGRAM_ID must be numeric, got: ${ownerRaw}`);
  }

  return {
    telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    ownerTelegramId,
    allowedChatIds: parseChatIds(optional('ALLOWED_CHAT_IDS')),
    confidenceThreshold: parseThreshold(optional('CONFIDENCE_THRESHOLD')),
    logLevel: parseLogLevel(optional('LOG_LEVEL')),
    classifierModel: optional('CLASSIFIER_MODEL') ?? 'claude-haiku-4-5-20251001',
    responderModel: optional('RESPONDER_MODEL') ?? 'claude-haiku-4-5-20251001',
    digestModel:
      optional('DIGEST_MODEL') ?? optional('INSIGHTS_MODEL') ?? 'claude-sonnet-4-6',
    digestDailyHourUtc: parseHourOfDay(
      'DIGEST_DAILY_HOUR_UTC',
      optional('DIGEST_DAILY_HOUR_UTC'),
      6,
    ),
    digestWindowHours: parseWindowHours(
      'DIGEST_WINDOW_HOURS',
      optional('DIGEST_WINDOW_HOURS'),
      24,
    ),
    digestEnabled: (optional('DIGEST_ENABLED') ?? 'true').toLowerCase() !== 'false',
    databasePath: optional('DATABASE_PATH') ?? './data/tg-agent.db',
    adminPort: parsePort(optional('ADMIN_PORT'), 8080),
    adminUsername: optional('ADMIN_USERNAME') ?? 'admin',
    adminPassword: optional('ADMIN_PASSWORD'),
    adminSessionSecret: optional('ADMIN_SESSION_SECRET'),
    adminPublicUrl: optional('ADMIN_PUBLIC_URL'),
    backupIntervalHours: parseHours(optional('BACKUP_INTERVAL_HOURS'), 24),
    healthFailureThreshold: parsePositiveInt(
      'HEALTH_FAILURE_THRESHOLD',
      optional('HEALTH_FAILURE_THRESHOLD'),
      3,
    ),
    healthAlertCooldownMinutes: parsePositiveInt(
      'HEALTH_ALERT_COOLDOWN_MINUTES',
      optional('HEALTH_ALERT_COOLDOWN_MINUTES'),
      60,
    ),
  };
}
