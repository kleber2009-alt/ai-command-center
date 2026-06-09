import 'dotenv/config';

import type { ReasoningEffort } from './llm.js';

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

function parseReasoningEffort(raw: string | undefined): ReasoningEffort {
  const v = (raw ?? 'low').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  throw new Error(`CODEX_REASONING_EFFORT must be low|medium|high, got: ${raw}`);
}

export interface Config {
  telegramBotToken: string;
  // LLM provider — codex.sale (OpenAI-compatible /v1). Drives the
  // classifier, responder and daily digest.
  llmApiKey: string;
  llmBaseUrl: string;
  llmReasoningEffort: ReasoningEffort;
  ownerTelegramId: number | undefined;
  allowedChatIds: Set<number>;
  confidenceThreshold: number;
  logLevel: LogLevel;
  classifierModel: string;
  responderModel: string;
  databasePath: string;
  adminPort: number;
  adminUsername: string;
  adminPassword: string | undefined;
  adminSessionSecret: string | undefined;
  adminPublicUrl: string | undefined;
  backupIntervalHours: number;
  healthFailureThreshold: number;
  healthAlertCooldownMinutes: number;
  stripeWebhookSecret: string | undefined;
  stripeBasicPriceId: string | undefined;
  stripeProPriceId: string | undefined;
  stripeEnterprisePriceId: string | undefined;
  digestModel: string;
  digestDailyHourUtc: number;
  digestWindowHours: number;
  digestEnabled: boolean;
  reportEnabled: boolean;
  reportHourUtc: number;
  reportRunOnStart: boolean;
  memoryEnabled: boolean;
  openaiApiKey: string | undefined;
  embeddingModel: string;
  qdrantUrl: string;
  qdrantCollection: string;
  qdrantApiKey: string | undefined;
  igAgentUrl: string | undefined;
  igAgentUsername: string | undefined;
  igAgentPassword: string | undefined;
  officeHqBaseUrl: string | undefined;
  officeHqWebUrl: string | undefined;
  officeHqTimeoutMs: number;
  // Shared secret that lets a trusted upstream (Caddy /tg-api/* proxy
  // on the unified dashboard) skip cookie/basic-auth on /api/*. Empty
  // ⇒ no bypass — admin stays sealed behind session/basic-auth.
  internalAuthToken: string | undefined;
}

export function loadConfig(): Config {
  const ownerRaw = optional('OWNER_TELEGRAM_ID');
  const ownerTelegramId = ownerRaw ? Number(ownerRaw) : undefined;
  if (ownerRaw && !Number.isFinite(ownerTelegramId)) {
    throw new Error(`OWNER_TELEGRAM_ID must be numeric, got: ${ownerRaw}`);
  }

  return {
    telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
    // codex.sale API key (sk-inv-…). CODEX_API_KEY is canonical;
    // ANTHROPIC_API_KEY is accepted as a legacy fallback so existing
    // deploys don't hard-fail on the rename.
    llmApiKey: required(process.env.CODEX_API_KEY ? 'CODEX_API_KEY' : 'ANTHROPIC_API_KEY'),
    llmBaseUrl: optional('CODEX_BASE_URL') ?? 'https://codex.sale/v1',
    llmReasoningEffort: parseReasoningEffort(optional('CODEX_REASONING_EFFORT')),
    ownerTelegramId,
    allowedChatIds: parseChatIds(optional('ALLOWED_CHAT_IDS')),
    confidenceThreshold: parseThreshold(optional('CONFIDENCE_THRESHOLD')),
    logLevel: parseLogLevel(optional('LOG_LEVEL')),
    classifierModel: optional('CLASSIFIER_MODEL') ?? 'gpt-5.4-mini',
    responderModel: optional('RESPONDER_MODEL') ?? 'gpt-5.4-mini',
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
    stripeWebhookSecret: optional('STRIPE_WEBHOOK_SECRET'),
    stripeBasicPriceId: optional('STRIPE_BASIC_PRICE_ID'),
    stripeProPriceId: optional('STRIPE_PRO_PRICE_ID'),
    stripeEnterprisePriceId: optional('STRIPE_ENTERPRISE_PRICE_ID'),
    digestModel:
      optional('DIGEST_MODEL') ?? optional('INSIGHTS_MODEL') ?? 'gpt-5.5',
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
    digestEnabled:
      (optional('DIGEST_ENABLED') ?? 'true').toLowerCase() !== 'false',
    reportEnabled:
      (optional('REPORT_ENABLED') ?? 'true').toLowerCase() !== 'false',
    reportHourUtc: parseHourOfDay('REPORT_HOUR_UTC', optional('REPORT_HOUR_UTC'), 6),
    reportRunOnStart:
      (optional('REPORT_RUN_ON_START') ?? 'false').toLowerCase() === 'true',
    memoryEnabled:
      (optional('MEMORY_ENABLED') ?? 'true').toLowerCase() !== 'false',
    openaiApiKey: optional('OPENAI_API_KEY'),
    embeddingModel: optional('EMBEDDING_MODEL') ?? 'text-embedding-3-small',
    qdrantUrl: optional('QDRANT_URL') ?? 'http://aisales-qdrant:6333',
    qdrantCollection: optional('QDRANT_COLLECTION') ?? 'aicex-memory',
    qdrantApiKey: optional('QDRANT_API_KEY'),
    igAgentUrl: optional('IG_AGENT_URL') ?? 'http://ig-agent:8081',
    igAgentUsername: optional('IG_AGENT_USERNAME'),
    igAgentPassword: optional('IG_AGENT_PASSWORD'),
    officeHqBaseUrl: optional('OFFICE_HQ_BASE_URL'),
    officeHqWebUrl: optional('OFFICE_HQ_WEB_URL'),
    officeHqTimeoutMs: parsePositiveInt('OFFICE_HQ_TIMEOUT_MS', optional('OFFICE_HQ_TIMEOUT_MS'), 7_000),
    internalAuthToken: optional('INTERNAL_AUTH_TOKEN'),
  };
}
