"""Конфиг приложения — всё через окружение (см. ../.env.example).

pydantic-settings, чтобы валидация и типы шли из коробки. Тяжёлые внешние
ключи (Apify/Claude/Threads) опциональны на уровне типа: воркеры, которым они
нужны, проверяют их наличие сами и падают с понятным сообщением.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # — Хранилище —
    database_url: str = "postgresql+psycopg://threads_viral:threads_viral@localhost:5432/threads_growth"

    # — Дискавери (Apify) —
    apify_token: str = ""
    apify_threads_actor: str = ""        # id актора-скрейпера Threads
    apify_twitter_actor: str = ""
    apify_reddit_actor: str = ""
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

    # — Шифрование токенов аккаунтов (§13, access_token[encrypted]) —
    token_encryption_key: str = ""       # Fernet key: `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
