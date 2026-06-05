// Server-side env validation — fails fast on startup if что-то не настроено.
//
// ВАЖНО: этот файл импортируется только из server-кода (workers, API routes,
// server components, server libs). НЕ импортируется из client components —
// process.env там пуст (кроме NEXT_PUBLIC_*).
//
// Для клиентских значений (например, cost в кнопке) используются дефолты
// в video-engines.ts, синхронизированные с дефолтами здесь.

import { z } from 'zod';

const envSchema = z.object({
  // ── Infra ──────────────────────────────────────
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379/3'),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().default('persona-studio-media'),
  S3_PUBLIC_URL: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z
    .union([z.string(), z.boolean()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .default('true'),

  // ── Avatar generation ─────────────────────────
  KIE_API_KEY: z.string().min(1),
  KIE_BASE_URL: z.string().url().default('https://api.kie.ai/api/v1'),
  KIE_IMAGE_MODEL: z.string().default('nano-banana-2'),
  KIE_FLUX_BASE_URL: z.string().url().default('https://api.kie.ai/api/v1/flux/kontext'),
  KIE_FLUX_MODEL: z.string().default('flux-kontext-pro'),
  AVATAR_ENGINE: z.enum(['flux', 'nano-banana']).default('flux'),
  WORKER_AVATAR_CONCURRENCY: z.coerce.number().default(2),
  WORKER_PER_STYLE_PARALLEL: z.coerce.number().default(3),

  // ── HeyGen ────────────────────────────────────
  HEYGEN_API_KEY: z.string().min(1),
  HEYGEN_API_BASE: z.string().url().default('https://api.heygen.com'),
  HEYGEN_UPLOAD_BASE: z.string().url().default('https://upload.heygen.com'),

  // ── OmniHuman (kie.ai) ────────────────────────
  KIE_OMNIHUMAN_MODEL: z.string().default('bytedance-omnihuman-1.5'),
  OMNIHUMAN_MAX_TTS_CHARS: z.coerce.number().default(400),
  OMNIHUMAN_MAX_POLL_MS: z.coerce.number().default(420_000), // 7 минут

  // ── ElevenLabs TTS ────────────────────────────
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_API_BASE: z.string().url().default('https://api.elevenlabs.io/v1'),
  ELEVENLABS_MODEL: z.string().default('eleven_turbo_v2_5'),
  ELEVENLABS_TTS_TIMEOUT_MS: z.coerce.number().default(30_000),

  // ── Parser (Viral Discover) ───────────────────
  APIFY_TOKEN: z.string().min(1).optional(),
  APIFY_INSTAGRAM_ACTOR: z.string().default('apify~instagram-scraper'),
  APIFY_LOOKBACK_DAYS: z.coerce.number().default(7),
  APIFY_RESULTS_LIMIT: z.coerce.number().default(25),
  APIFY_TIMEOUT_MS: z.coerce.number().default(60_000),
  // Reels keyword-search actor (ищет рилсы напрямую по запросу, как поиск
  // Reels в приложении IG). Возвращает рилсы со всеми метриками, включая
  // shares. Используется как ОСНОВНОЙ источник в /api/research/search.
  // 'off' (или пустое) → отключить и работать только через хэштеги.
  // patient_discovery/instagram-search-reels (actor id). Вход {query, maxPages},
  // cookieless. Можно заменить на 'data-slayer~instagram-search-reels' и др.
  APIFY_REELS_SEARCH_ACTOR: z.string().default('TxU0ZBQIHdR20dr9C'),
  APIFY_REELS_SEARCH_MAX_PAGES: z.coerce.number().default(2),
  // Сколько запросов (ниша + смежные ключи) гоняем за один поиск.
  APIFY_REELS_SEARCH_MAX_QUERIES: z.coerce.number().default(3),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_PARSER_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  // OpenAI — нужен только для транскрибации (Whisper API). Если задан и
  // WHISPER_SERVICE_URL не задан, transcribeReel идёт в api.openai.com.
  // $0.006/мин — для v1-объёмов копейки, проще чем поднимать faster-whisper.
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_WHISPER_MODEL: z.string().default('whisper-1'),

  // ── Submagic (editing / captions) ─────────────
  SUBMAGIC_API_KEY: z.string().min(1).optional(),
  SUBMAGIC_API_BASE: z.string().url().default('https://api.submagic.co/v1'),
  SUBMAGIC_MAX_POLL_MS: z.coerce.number().default(900_000), // 15 минут
  SUBMAGIC_POLL_INTERVAL_MS: z.coerce.number().default(8_000),

  // ── Costs (env-driven) ────────────────────────
  COST_AVATAR_GENERATION: z.coerce.number().default(10),
  COST_COVER_GENERATION: z.coerce.number().default(3),
  COST_HEYGEN_VIDEO: z.coerce.number().default(30),
  COST_OMNIHUMAN_VIDEO: z.coerce.number().default(50),
  COST_SUBMAGIC_EDIT: z.coerce.number().default(15),
  COST_SLIDE_IMAGE: z.coerce.number().default(3),
  // ── Research (Badunga-style) ──
  COST_RESEARCH_TRANSCRIBE: z.coerce.number().default(5),
  COST_RESEARCH_TRANSLATE: z.coerce.number().default(1),
  COST_RESEARCH_ANALYZE: z.coerce.number().default(5),
  COST_RESEARCH_PAGE_ANALYZE: z.coerce.number().default(10),
  COST_RESEARCH_REFRESH_AUTHOR: z.coerce.number().default(5),
  COST_RESEARCH_HOOK_GEN: z.coerce.number().default(1),
  ANTHROPIC_DEEP_MODEL: z.string().default('claude-sonnet-4-6'),
  // Monthly Apify budget cap in CENTS (ТЗ §16 риск «Бюджет Apify»).
  // 5000 = $50/мес. Каждый scrape инкрементит usage; при превышении —
  // дальнейшие вызовы возвращают error без обращения к Apify.
  APIFY_MONTHLY_BUDGET_CENTS: z.coerce.number().default(5000),
  // Стоимость 1 элемента (USD-cents). Дефолт = $2.30/1000 actor.
  APIFY_CENTS_PER_ITEM: z.coerce.number().default(0.23),
  // Voyage AI — эмбеддинги для семантического дедупа research-рилсов.
  // Без ключа дедуп работает по captionHash (fallback).
  VOYAGE_API_KEY: z.string().min(1).optional(),
  VOYAGE_MODEL: z.string().default('voyage-3'),
  // Qdrant — vector store. На проде уже бежит как aisales-qdrant.
  QDRANT_URL: z.string().url().optional(),
  QDRANT_API_KEY: z.string().min(1).optional(),
  // Имя коллекции для research-рилсов. Каждая запись = один ResearchReel.
  QDRANT_REELS_COLLECTION: z.string().default('research_reels'),
  SIGNUP_BONUS_TOKENS: z.coerce.number().default(10),

  // ── Scheduler & Autoposting ───────────────────
  // Все optional — модуль деградирует мягко: без ключей канал просто
  // нельзя подключить, остальное приложение работает.
  //
  // Telegram: переиспользуем TELEGRAM_BOT_TOKEN (тот же бот, что и для TMA-
  // оплат). Для постинга в канал бот должен быть его админом.
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  // 32-байтный секрет (base64 или hex) для AES-256-GCM шифрования
  // long-lived IG-токенов в SocialAccount.accessToken. Без него подключение
  // Instagram недоступно (lib/publish/crypto бросит).
  PUBLISH_TOKEN_SECRET: z.string().min(1).optional(),
  // Meta / Facebook Login for Instagram Graph Content Publishing API.
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_OAUTH_REDIRECT: z.string().url().optional(),
  IG_GRAPH_VERSION: z.string().default('v21.0'),
  // Интервал publish-sweep (мс). Каждый тик берёт scheduled-посты с
  // scheduledAt <= now и ставит их таргеты в очередь.
  PUBLISH_CRON_TICK_MS: z.coerce.number().default(60_000),

  // ── Auth ──────────────────────────────────────
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_URL: z.string().url().optional(),
  EMAIL_SERVER: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Lazy-parse при первом обращении. Throws ZodError если env не валидна —
 * это нормально для startup-fail в runtime.
 *
 * SKIP во время `next build` (NEXT_PHASE=phase-production-build) — на билде
 * Next.js делает collect-page-data без runtime ENV (env_file у docker-compose
 * подключается только на старте контейнера). Без skip билд падает на любом
 * роуте который транзитивно импортирует env. Паттерн из T3 stack.
 */
function loadEnv(): Env {
  if (_env) return _env;
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    _env = process.env as unknown as Env;
    return _env;
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[env] invalid environment:\n${issues}`);
  }
  _env = parsed.data;
  return _env;
}

export const env = new Proxy({} as Env, {
  get(_, key: string) {
    return loadEnv()[key as keyof Env];
  },
});
