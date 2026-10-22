// Admin-managed integration keys («Админ → Интеграции»).
//
// Values live in the AppSetting table and are applied on top of process.env:
// at web startup (src/instrumentation.ts), at worker startup, and every 30 s
// afterwards, so a key pasted in the browser reaches every process without
// touching .env on the server. Deleting a key restores the .env value.
//
// Server-only: imports Prisma.

import { prisma } from '@/lib/prisma';
import { resetEnvCache } from '@/lib/env';

export type Integration = {
  key: string;
  label: string;
  /** what breaks without it, shown in the admin UI */
  purpose: string;
  /** where to get it */
  url?: string;
  secret: boolean;
  group: 'generation' | 'text' | 'voice' | 'research' | 'publish' | 'billing' | 'mail';
  /** takes effect only after the web container restarts */
  restart?: boolean;
};

export const INTEGRATIONS: Integration[] = [
  { key: 'KIE_API_KEY', label: 'kie.ai', purpose: 'Аватары, обложки, говорящее видео, AI-картинки слайдов', url: 'https://kie.ai/api-key', secret: true, group: 'generation' },
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude)', purpose: 'Сценарии, карусели из темы, модерация фото, разбор рилсов', url: 'https://console.anthropic.com/settings/keys', secret: true, group: 'text' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI', purpose: 'Запасной провайдер для текстов, если Claude недоступен', url: 'https://platform.openai.com/api-keys', secret: true, group: 'text' },
  { key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs', purpose: 'Клонирование голоса и озвучка видео', url: 'https://elevenlabs.io/app/settings/api-keys', secret: true, group: 'voice' },
  { key: 'HEYGEN_API_KEY', label: 'HeyGen', purpose: 'Альтернативный движок говорящего видео', url: 'https://app.heygen.com/settings?nav=API', secret: true, group: 'generation' },
  { key: 'SUBMAGIC_API_KEY', label: 'Submagic', purpose: 'Монтаж готовых видео по шаблонам (раздел «Монтаж»)', url: 'https://app.submagic.co/api', secret: true, group: 'generation' },
  { key: 'APIFY_TOKEN', label: 'Apify', purpose: 'Ресёрч вирусных рилсов, парсер, радары', url: 'https://console.apify.com/settings/integrations', secret: true, group: 'research' },
  { key: 'VOYAGE_API_KEY', label: 'Voyage AI', purpose: 'Антиплагиат сценариев и дедуп ресёрча (опционально)', url: 'https://dash.voyageai.com/api-keys', secret: true, group: 'research' },
  { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram-бот', purpose: 'Оплата Stars, мини-приложение, автопостинг в каналы', url: 'https://t.me/BotFather', secret: true, group: 'publish' },
  { key: 'POSTMYPOST_API_TOKEN', label: 'PostMyPost', purpose: 'Автопостинг в Instagram', url: 'https://postmypost.io', secret: true, group: 'publish' },
  { key: 'CRYPTOBOT_TOKEN', label: 'CryptoBot', purpose: 'Оплата в USDT', url: 'https://t.me/CryptoBot', secret: true, group: 'billing' },
  { key: 'AUTH_GOOGLE_ID', label: 'Google — Client ID', purpose: 'Вход через Google (в Google Cloud добавьте redirect https://<домен>/api/auth/callback/google)', url: 'https://console.cloud.google.com/apis/credentials', secret: false, group: 'mail', restart: true },
  { key: 'AUTH_GOOGLE_SECRET', label: 'Google — Client secret', purpose: 'Секрет того же OAuth-клиента', secret: true, group: 'mail', restart: true },
  { key: 'EMAIL_SERVER_HOST', label: 'SMTP-сервер', purpose: 'Письма со ссылкой входа (например smtp.resend.com)', secret: false, group: 'mail', restart: true },
  { key: 'EMAIL_SERVER_PORT', label: 'SMTP-порт', purpose: '465 (SSL) или 587', secret: false, group: 'mail', restart: true },
  { key: 'EMAIL_SERVER_USER', label: 'SMTP-логин', purpose: 'Логин почтового сервиса', secret: false, group: 'mail', restart: true },
  { key: 'EMAIL_SERVER_PASSWORD', label: 'SMTP-пароль', purpose: 'Пароль / API-ключ почтового сервиса', secret: true, group: 'mail', restart: true },
  { key: 'EMAIL_FROM', label: 'Отправитель', purpose: 'Например: Persona Studio <noreply@ваш-домен>', secret: false, group: 'mail', restart: true },
];

const ALLOWED = new Set(INTEGRATIONS.map((i) => i.key));
export function isIntegrationKey(key: string): boolean {
  return ALLOWED.has(key);
}

// process.env values from .env, captured before the first override so a
// deleted setting falls back to them.
const original = new Map<string, string | undefined>();
let lastSignature = '';

function apply(rows: { key: string; value: string }[]): void {
  const signature = rows.map((r) => `${r.key}=${r.value}`).sort().join('\n');
  if (signature === lastSignature) return;
  lastSignature = signature;
  const set = new Map(rows.filter((r) => ALLOWED.has(r.key)).map((r) => [r.key, r.value]));
  for (const key of ALLOWED) {
    if (!original.has(key)) original.set(key, process.env[key]);
    const v = set.get(key);
    if (v !== undefined && v !== '') process.env[key] = v;
    else if (original.get(key) === undefined) delete process.env[key];
    else process.env[key] = original.get(key);
  }
  resetEnvCache();
}

/** Load AppSetting rows into process.env. Missing table / DB down → no-op. */
export async function loadAppSettings(): Promise<void> {
  try {
    apply(await prisma.appSetting.findMany({ select: { key: true, value: true } }));
  } catch (e) {
    console.warn('[app-settings] load skipped:', e instanceof Error ? e.message : e);
  }
}

let lastLoadAt = 0;
/**
 * Re-read AppSetting at most once per `maxAgeMs`. Workers call it at the start
 * of every job: the web process applies a key the moment the admin saves it and
 * accepts work right away, so the worker must not wait for the 30 s sync tick.
 */
export async function refreshAppSettings(maxAgeMs = 2_000): Promise<void> {
  if (Date.now() - lastLoadAt < maxAgeMs) return;
  lastLoadAt = Date.now();
  await loadAppSettings();
}

let timer: ReturnType<typeof setInterval> | null = null;
/** Keep this process in sync with keys changed from another process. */
export function startAppSettingsSync(intervalMs = 30_000): void {
  if (timer) return;
  timer = setInterval(() => void loadAppSettings(), intervalMs);
  timer.unref?.();
}

export async function saveAppSetting(key: string, value: string): Promise<void> {
  if (!ALLOWED.has(key)) throw new Error(`unknown setting ${key}`);
  const v = value.trim();
  if (v) await prisma.appSetting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
  else await prisma.appSetting.deleteMany({ where: { key } });
  await loadAppSettings();
}

/** Status for the admin UI — never returns full secret values. */
export async function integrationStatus(): Promise<
  (Integration & { configured: boolean; source: 'admin' | 'env' | null; preview: string | null })[]
> {
  await loadAppSettings();
  const rows = await prisma.appSetting
    .findMany({ select: { key: true } })
    .catch(() => [] as { key: string }[]);
  const fromAdmin = new Set(rows.map((r) => r.key));
  const placeholder = new Set(['', 'unset', 'build', 'changeme', 'CHANGE_ME']);
  return INTEGRATIONS.map((i) => {
    const v = (process.env[i.key] ?? '').trim();
    const configured = !placeholder.has(v);
    return {
      ...i,
      configured,
      source: configured ? (fromAdmin.has(i.key) ? 'admin' : 'env') : null,
      preview: configured ? (i.secret ? `••••${v.slice(-4)}` : v) : null,
    };
  });
}
