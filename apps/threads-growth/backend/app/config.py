"""Конфиг приложения — всё через окружение (см. ../.env.example).

pydantic-settings, чтобы валидация и типы шли из коробки. Тяжёлые внешние
ключи (Apify/Claude/Threads) опциональны на уровне типа: воркеры, которым они
нужны, проверяют их наличие сами и падают с понятным сообщением.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # env_ignore_empty: пустые `CHANNEL_ID=` и т.п. в .env = значение по умолчанию.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    # — Хранилище —
    database_url: str = "postgresql+psycopg://threads_viral:threads_viral@localhost:5432/threads_growth"

    # — Дискавери (Apify) —
    apify_token: str = ""
    apify_threads_actor: str = ""        # id актора-скрейпера Threads (напр. futurizerush/meta-threads-scraper)
    apify_twitter_actor: str = ""
    apify_reddit_actor: str = ""
    # JSON-шаблон run_input под конкретного актора (плейсхолдеры "{query}"/{limit}).
    # Пусто = дефолт keywords[]/resultsLimit/sort. Задать, если у актора иные ключи.
    apify_threads_input: str = ""
    apify_twitter_input: str = ""
    apify_reddit_input: str = ""
    lookback_hours: int = 72             # фильтр свежести дискавери (§5)
    dedup_threshold: float = 0.92        # косинус-дубль по embedding (§5)

    # — Скоринг (§6) —
    xn_category_a: float = 5.0           # A ≥ 5
    xn_category_b: float = 3.0           # B 3–5
    xn_category_c: float = 1.5           # C 1.5–3 ; D < 1.5
    rank_w_xn: float = 0.6
    rank_w_velocity: float = 0.3
    rank_w_engagement: float = 0.1

    # — Claude (Agent SDK / API) —
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    adapt_variants: int = 5              # адаптаций на пост (§8)

    # — Уникализация (§8) —
    text_similarity_max: float = 0.25
    semantic_similarity_max: float = 0.80

    # — Эмбеддинги (Voyage; опц.) —
    voyage_api_key: str = ""
    voyage_model: str = "voyage-3"
    embedding_dim: int = 1536

    # — Threads Graph API —
    threads_api_base: str = "https://graph.threads.net/v1.0"

    # — Telegram-апрув —
    telegram_bot_token: str = ""
    owner_telegram_id: int = 0
    review_batch: int = 10               # сколько карточек слать за один /drafts|/replies
    review_daily_time: str = ""          # HH:MM UTC: ежедневный авто-пуш на ревью (пусто = только вручную)
    webapp_auth_disabled: bool = False   # 1 — отключить Telegram-авторизацию мини-аппы (только для локальной разработки)

    # — Шифрование токенов аккаунтов (§13, access_token[encrypted]) —
    token_encryption_key: str = ""       # Fernet key: `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`

    # — Воронка Threads → Telegram (app/funnel, скилл threads-telegram-funnel) —
    funnel_model: str = "claude-opus-5-5"   # модель агентов воронки (план, ветки, QA, ответы)
    funnel_fallbacks: bool = True        # server-side fallback при отказе модели (fallbacks="default")
    funnel_tz: str = "Europe/Moscow"
    funnel_slots: str = "10:00,13:00,18:00"   # решение 4
    funnel_chat_id: int = 0              # командная форум-группа; 0 = личка владельца
    funnel_topic_id: int = 0             # message_thread_id темы «Threads» в форум-группе
    funnel_editor_ids: str = ""          # кроме владельца — кто ещё жмёт кнопки (id через запятую)
    funnel_account_id: int = 0           # accounts.id, от имени которого публикуем; 0 = первый не-paused
    funnel_autopublish: bool = False     # этап 2: выход по слотам через Threads API; 0 = этап 1 (публикуете сами)
    funnel_unanswered: str = "skip"      # решение 2: ветка без ✅ к слоту — skip | publish
    funnel_voice_level: int = 3          # решение 3: громкость 1–5
    funnel_donors: str = "petkova_anjela"   # решение 5: аккаунты-доноры для тем (через запятую, без @)
    funnel_reply_mode: str = "drafts"    # решение 6: ответы на комментарии — drafts | auto
    funnel_start_date: str = ""          # YYYY-MM-DD старт системы (2 недели только новые); пусто = первая ветка
    funnel_reply_window_hours: int = 2   # сколько часов после выхода собираем комментарии
    # Исследование (05:00 МСК): что залетает у доноров и по темам — основа плана и прогноза
    funnel_research_queries: str = "нейросеть,ChatGPT,Claude,промпт,ИИ психолог,ИИ ассистент,нейрофото,контент план"
    funnel_min_score: float = 6.0        # ниже — агент один раз дорабатывает ветку по подсказке аналитика

    # — Канал-приёмник (решение 1) —
    channel_id: int = 0                  # id канала (-100…); бот должен быть админом
    channel_username: str = ""           # @username публичного канала без @ (для mode=public)
    channel_mode: str = "private"        # private — ссылка-приглашение под каждую ветку | public — ссылка на пост
    channel_fallback_link: str = ""      # общая ссылка на канал, пока нет приёмника/прав бота
    # Статистика каналов автора (app/funnel/channel.py): username публичного и -100… закрытого
    channel_stats_sources: str = "ai_razbory,-1001843525349"
    # Куда ведёт {link}: канал, где лежит материал ветки → ссылка подписки (источник=ссылка, через запятую)
    channel_links: str = "-1001843525349=https://t.me/+xP6G7c04QRZiY2My,ai_razbory=https://t.me/ai_razbory"
    channel_stats_limit: int = 300       # сколько последних постов каждого канала смотреть
    tg_api_id: int = 0                   # my.telegram.org — для закрытого канала (Telethon)
    tg_api_hash: str = ""
    tg_session: str = ""                 # строка сессии из `python -m app.funnel.channel login`

    # — MinIO: картинки к посту 1 по временной ссылке —
    minio_endpoint: str = ""             # внутренний host:port, напр. aisales-minio:9000
    minio_public_endpoint: str = ""      # публичный host, которым Threads заберёт картинку (подпись ссылки)
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "threads-funnel"
    minio_secure: bool = False           # https до minio_endpoint
    minio_public_secure: bool = True     # https у публичного host
    minio_region: str = "us-east-1"

    # — Распознавание голоса (правки и /story голосом) —
    openai_api_key: str = ""             # Whisper API
    whisper_service_url: str = ""        # self-hosted OpenAI-совместимый whisper (приоритетнее)
    whisper_api_key: str = ""
    whisper_model: str = "whisper-1"

    # — Кроны n8n по HTTP (/cron/funnel/<job>) —
    cron_secret: str = ""                # заголовок X-Cron-Secret; пусто = HTTP-кроны выключены


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
