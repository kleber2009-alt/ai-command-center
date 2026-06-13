#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# bootstrap-deploy.sh — ЕДИНЫЙ самодостаточный деплой tg-viral-parser.
#
# Один файл = весь проект. Сохрани его куда угодно и запусти в терминале VS Code:
#     bash bootstrap-deploy.sh
#
# Скрипт сам создаёт все файлы проекта в подкаталоге ./tg-viral-parser и
# разворачивает через Docker (парсер + review-бот). Идемпотентный.
# Нужен Docker Desktop (установлен и запущен).
#
# !!! ВНИМАНИЕ: исходники зашиты в этот файл генератором из репозитория.
#     Правки коду делай в репозитории, а не здесь — этот файл перегенерируется.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="${1:-tg-viral-parser}"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

bold "[0/8] Распаковываю файлы проекта в $(pwd)…"
cat > requirements.txt <<'REQ_EOF'
telethon>=1.36
asyncpg>=0.29
python-dotenv>=1.0
python-telegram-bot[job-queue]==21.6
anthropic>=0.40
REQ_EOF

cat > Dockerfile <<'DOCKER_EOF'
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY tg_viral_parser.py review_bot.py .

# ENTRYPOINT — интерпретатор, скрипт+команда задаются через CMD / compose `command`:
#   парсер:    python -u tg_viral_parser.py run|login|init-db|selftest   (по умолч. ниже)
#   review-бот: python -u review_bot.py                                  (см. docker-compose.yml)
ENTRYPOINT ["python", "-u"]
CMD ["tg_viral_parser.py", "run"]
DOCKER_EOF

cat > docker-compose.yml <<'COMPOSE_EOF'
# tg-viral-parser — парсинг+скоринг виральных постов Telegram-каналов конкурентов.
#
# Это не сервис, а CLI, который отрабатывает и завершается (cron-style),
# поэтому без restart-петли. Запускать по требованию или по расписанию:
#
#   docker compose run --rm tg-viral-parser run        # парсинг + скоринг (по умолч.)
#   docker compose run --rm tg-viral-parser selftest   # проверка скоринга на моках
#   docker compose run --rm tg-viral-parser init-db    # 1 раз: создать таблицу
#   docker compose run --rm tg-viral-parser login      # 1 раз: получить session string
services:
  # Модуль 1 — парсер+скоринг. CLI отрабатывает и завершается (cron-style).
  tg-viral-parser:
    build: .
    image: tg-viral-parser:local
    container_name: tg-viral-parser
    env_file: .env
    restart: "no"

  # Модуль 2 — review-бот (ревью + публикация). Long-running, polling.
  tg-viral-review-bot:
    build: .
    image: tg-viral-parser:local
    container_name: tg-viral-review-bot
    env_file: .env
    command: ["review_bot.py"]
    restart: unless-stopped

# Контейнеры цепляются к ВНЕШНЕЙ сети, где живёт Postgres, чтобы DATABASE_URL
# мог ходить на него по hostname (на проде — aisales-postgres в aisales_aisales-net).
# Имя сети переопределяется через TGVIRAL_NETWORK в .env; должна существовать заранее.
networks:
  default:
    name: ${TGVIRAL_NETWORK:-aisales_aisales-net}
    external: true

COMPOSE_EOF

cat > .env.example <<'ENVEX_EOF'
# Telegram API credentials — my.telegram.org → API development tools
TG_API_ID=
TG_API_HASH=

# Session string ОТДЕЛЬНОГО парсинг-аккаунта (НЕ основной номер).
# Получить: python tg_viral_parser.py login
TG_SESSION_STRING=

# Каналы конкурентов через запятую
COMPETITOR_CHANNELS=@channel1,@channel2,@channel3

# Сколько постов тянуть с каждого канала (верхняя граница iter_messages)
POSTS_PER_CHANNEL=100

# Окно свежести: посты старше N дней игнорируются
LOOKBACK_DAYS=7

# Сколько постов показать в итоговом топе
TOP_N=10

# Необязательно для парсера / ОБЯЗАТЕЛЬНО для review_bot.py:
# куда складывать и откуда читать результаты (Supabase/Postgres).
# Для tg_viral_parser.py пусто = только вывод в консоль, без записи в БД.
# Прод (aisales-postgres в общей сети): postgresql://tg_viral:ПАРОЛЬ@aisales-postgres:5432/tg_viral
DATABASE_URL=

# Внешняя docker-сеть, куда подключить контейнеры, чтобы дойти до Postgres по hostname.
# Прод: aisales_aisales-net (сеть, где живёт aisales-postgres). Должна существовать заранее.
TGVIRAL_NETWORK=aisales_aisales-net

# ── review_bot.py (модуль 2: ревью + публикация) ────────────────────────────
# Бот @BotFather (можно тот же, что шлёт дайджесты)
TELEGRAM_BOT_TOKEN=

# Твой numeric Telegram id — только он видит ревью и жмёт кнопки
OWNER_TELEGRAM_ID=

# Куда публиковать одобренное (@username или -100…). Бот должен быть АДМИНОМ канала.
PUBLISH_CHANNEL=

# Сколько постов слать за один /review
REVIEW_BATCH=10

# Ежедневный авто-пуш топа на ревью, HH:MM UTC. Пусто = только ручной /review.
REVIEW_DAILY_TIME=

# Рерайт текста через Claude перед публикацией. Пусто = публикуем verbatim.
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
ENVEX_EOF

cat > tg_viral_parser.py <<'PARSER_EOF'
"""
tg_viral_parser.py — модуль 1 (один файл): парсинг + скоринг конкурентов в Telegram.

Фундамент пайплайна: парсинг → СКОРИНГ → (дальше) ревью в боте → публикация.
Находит самые актуальные посты конкурентов и кладёт их в БД с оценкой.

────────────────────────────────────────────────────────────────────────────
КАК СЧИТАЕТСЯ «АКТУАЛЬНОСТЬ»
────────────────────────────────────────────────────────────────────────────
Не абсолютные просмотры (тогда крупный канал всегда побеждает), а ОТНОСИТЕЛЬНЫЕ
выбросы внутри канала — каждая метрика делится на медиану своего канала:

    Xn = просмотры / медиана   — относительный охват (outlier-метрик)
    Rn = реакции   / медиана   — реакции относительно нормы канала
    Fn = репосты   / медиана   — сильнейший сигнал «шерят/сохраняют»

    score = (w_v·Xn + w_r·Rn + w_f·Fn) · recency      (recency — распад по свежести)

Метрики нормированы на базу своего канала ⇒ сравнимы между каналами ⇒
глобальный топ собирается простым слиянием.

────────────────────────────────────────────────────────────────────────────
УСТАНОВКА
────────────────────────────────────────────────────────────────────────────
    python -m venv .venv && source .venv/bin/activate
    pip install "telethon>=1.36" "asyncpg>=0.29" "python-dotenv>=1.0"

Создай рядом файл .env:
────────────────────────── .env ──────────────────────────
    TG_API_ID=                # my.telegram.org -> API development tools
    TG_API_HASH=
    TG_SESSION_STRING=        # получить: python tg_viral_parser.py login
    COMPETITOR_CHANNELS=@channel1,@channel2,@channel3
    POSTS_PER_CHANNEL=100
    LOOKBACK_DAYS=7
    TOP_N=10
    DATABASE_URL=             # необязательно: postgresql://user:pass@host:5432/postgres
───────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────────────
ЗАПУСК
────────────────────────────────────────────────────────────────────────────
    python tg_viral_parser.py login      # 1 раз: получить session string (ОТДЕЛЬНЫЙ аккаунт!)
    python tg_viral_parser.py init-db    # 1 раз: создать таблицу (если задан DATABASE_URL)
    python tg_viral_parser.py run        # парсинг + скоринг + сохранение + топ в консоль
    python tg_viral_parser.py            # то же, что run

ВАЖНО: Bot API НЕ умеет читать чужие каналы — поэтому здесь user-session (MTProto).
Парсинг-аккаунт должен быть ОТДЕЛЬНЫМ (не основной номер).
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Sequence

from dotenv import load_dotenv

load_dotenv()


# ════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ════════════════════════════════════════════════════════════════════════════
def _csv(name: str) -> list[str]:
    return [x.strip() for x in os.getenv(name, "").split(",") if x.strip()]


@dataclass
class Config:
    api_id: int = int(os.getenv("TG_API_ID", "0"))
    api_hash: str = os.getenv("TG_API_HASH", "")
    session_string: str = os.getenv("TG_SESSION_STRING", "")
    competitor_channels: list[str] = field(default_factory=lambda: _csv("COMPETITOR_CHANNELS"))
    posts_per_channel: int = int(os.getenv("POSTS_PER_CHANNEL", "100"))
    lookback_days: int = int(os.getenv("LOOKBACK_DAYS", "7"))
    top_n: int = int(os.getenv("TOP_N", "10"))
    database_url: str = os.getenv("DATABASE_URL", "")

    def validate(self) -> None:
        missing = []
        if not self.api_id:
            missing.append("TG_API_ID")
        if not self.api_hash:
            missing.append("TG_API_HASH")
        if not self.session_string:
            missing.append("TG_SESSION_STRING (запусти: python tg_viral_parser.py login)")
        if not self.competitor_channels:
            missing.append("COMPETITOR_CHANNELS")
        if missing:
            raise SystemExit("Не заданы в .env: " + ", ".join(missing))


config = Config()


# ════════════════════════════════════════════════════════════════════════════
#  SCORING  (чистые функции — тестируемо без сети и БД)
# ════════════════════════════════════════════════════════════════════════════
@dataclass
class PostMetrics:
    channel: str
    message_id: int
    date: datetime          # tz-aware, UTC
    text: str
    views: int
    reactions_total: int
    forwards: int
    has_media: bool


@dataclass
class ScoredPost:
    post: PostMetrics
    xn: float
    rn: float
    fn: float
    recency: float
    score: float

    @property
    def url(self) -> str:
        return f"https://t.me/{self.post.channel.lstrip('@')}/{self.post.message_id}"


@dataclass
class ScoringWeights:
    w_views: float = 1.0
    w_reactions: float = 1.2       # реакция > просмотра как сигнал интереса
    w_forwards: float = 1.5        # репост — сильнейший сигнал «достойно копирования»
    half_life_hours: float = 48.0  # период полураспада свежести
    min_score: float = 0.0         # порог отсечения мусора


def _safe_median(values: Sequence[float]) -> float:
    vals = [v for v in values if v and v > 0]
    return median(vals) if vals else 1.0


def score_channel(
    posts: list[PostMetrics],
    weights: ScoringWeights | None = None,
    now: datetime | None = None,
) -> list[ScoredPost]:
    """Скорит посты ОДНОГО канала относительно его медианы."""
    weights = weights or ScoringWeights()
    if not posts:
        return []
    now = now or datetime.now(timezone.utc)

    med_views = _safe_median([p.views for p in posts])
    med_reacts = _safe_median([p.reactions_total for p in posts])
    med_fwd = _safe_median([p.forwards for p in posts])

    scored: list[ScoredPost] = []
    for p in posts:
        xn = p.views / med_views
        rn = p.reactions_total / med_reacts
        fn = p.forwards / med_fwd
        age_h = max((now - p.date).total_seconds() / 3600.0, 0.0)
        recency = 0.5 ** (age_h / weights.half_life_hours)
        raw = weights.w_views * xn + weights.w_reactions * rn + weights.w_forwards * fn
        scored.append(ScoredPost(p, xn, rn, fn, recency, raw * recency))

    scored.sort(key=lambda s: s.score, reverse=True)
    return scored


def top_across_channels(
    per_channel: list[list[PostMetrics]],
    top_n: int = 10,
    weights: ScoringWeights | None = None,
    now: datetime | None = None,
) -> list[ScoredPost]:
    """Скорит каждый канал отдельно, затем сливает в общий топ."""
    weights = weights or ScoringWeights()
    merged: list[ScoredPost] = []
    for posts in per_channel:
        merged.extend(score_channel(posts, weights, now))
    merged = [s for s in merged if s.score >= weights.min_score]
    merged.sort(key=lambda s: s.score, reverse=True)
    return merged[:top_n]


# ════════════════════════════════════════════════════════════════════════════
#  PARSER  (Telethon / MTProto)
# ════════════════════════════════════════════════════════════════════════════
def _count_reactions(msg) -> int:
    if not msg.reactions or not msg.reactions.results:
        return 0
    return sum(r.count for r in msg.reactions.results)


async def fetch_channel(client, channel: str, limit: int, since: datetime | None) -> list[PostMetrics]:
    """iter_messages отдаёт от новых к старым → упёрлись в более старый, чем since → выходим."""
    posts: list[PostMetrics] = []
    async for msg in client.iter_messages(channel, limit=limit):
        if msg.date is None:
            continue
        if since and msg.date < since:
            break
        if not msg.message and not msg.media:
            continue
        posts.append(
            PostMetrics(
                channel=channel.lstrip("@"),
                message_id=msg.id,
                date=msg.date.astimezone(timezone.utc),
                text=msg.message or "",
                views=msg.views or 0,
                reactions_total=_count_reactions(msg),
                forwards=msg.forwards or 0,
                has_media=msg.media is not None,
            )
        )
    return posts


async def fetch_all(client, channels: list[str], limit: int, since: datetime | None) -> list[list[PostMetrics]]:
    per_channel: list[list[PostMetrics]] = []
    for ch in channels:
        try:
            posts = await fetch_channel(client, ch, limit, since)
            print(f"  [{ch}] спарсено постов: {len(posts)}")
            per_channel.append(posts)
        except Exception as e:  # один битый канал не должен ронять прогон
            print(f"  [{ch}] ОШИБКА: {e}")
            per_channel.append([])
    return per_channel


# ════════════════════════════════════════════════════════════════════════════
#  STORAGE  (asyncpg → Supabase/Postgres)
# ════════════════════════════════════════════════════════════════════════════
SCHEMA_SQL = """
create table if not exists parsed_posts (
    id              bigserial primary key,
    channel         text        not null,
    message_id      bigint      not null,
    posted_at       timestamptz not null,
    text            text        not null default '',
    has_media       boolean     not null default false,
    views           bigint      not null default 0,
    reactions_total bigint      not null default 0,
    forwards        bigint      not null default 0,
    xn              double precision not null default 0,
    rn              double precision not null default 0,
    fn              double precision not null default 0,
    recency         double precision not null default 0,
    score           double precision not null default 0,
    review_status   text        not null default 'new',  -- new|sent|approved|rejected|published
    parsed_at       timestamptz not null default now(),
    unique (channel, message_id)
);
create index if not exists idx_parsed_posts_score  on parsed_posts (score desc);
create index if not exists idx_parsed_posts_status on parsed_posts (review_status);
create index if not exists idx_parsed_posts_posted on parsed_posts (posted_at desc);
"""

_UPSERT = """
insert into parsed_posts
    (channel, message_id, posted_at, text, has_media,
     views, reactions_total, forwards, xn, rn, fn, recency, score)
values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
on conflict (channel, message_id) do update set
    views=excluded.views, reactions_total=excluded.reactions_total, forwards=excluded.forwards,
    xn=excluded.xn, rn=excluded.rn, fn=excluded.fn,
    recency=excluded.recency, score=excluded.score, parsed_at=now();
"""


async def init_db(database_url: str) -> None:
    if not database_url:
        raise SystemExit("DATABASE_URL не задан в .env")
    import asyncpg
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute(SCHEMA_SQL)
        print("БД готова: таблица parsed_posts создана/проверена.")
    finally:
        await conn.close()


async def save_scored(database_url: str, scored: list[ScoredPost]) -> int:
    if not database_url or not scored:
        return 0
    import asyncpg
    conn = await asyncpg.connect(database_url)
    try:
        rows = [
            (s.post.channel, s.post.message_id, s.post.date, s.post.text, s.post.has_media,
             s.post.views, s.post.reactions_total, s.post.forwards,
             s.xn, s.rn, s.fn, s.recency, s.score)
            for s in scored
        ]
        await conn.executemany(_UPSERT, rows)
        return len(rows)
    finally:
        await conn.close()


# ════════════════════════════════════════════════════════════════════════════
#  COMMANDS
# ════════════════════════════════════════════════════════════════════════════
def _build_client():
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    return TelegramClient(StringSession(config.session_string), config.api_id, config.api_hash)


def cmd_login() -> None:
    """Одноразовый вход → печатает TG_SESSION_STRING для .env."""
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    if not config.api_id or not config.api_hash:
        raise SystemExit("Сначала задай TG_API_ID и TG_API_HASH в .env")
    with TelegramClient(StringSession(), config.api_id, config.api_hash) as client:
        print("\n=== Скопируй в .env как TG_SESSION_STRING ===\n")
        print(client.session.save())
        print("\n=============================================\n")


def _print_top(top: list[ScoredPost]) -> None:
    print("\n" + "=" * 78)
    print(f"ТОП-{len(top)} АКТУАЛЬНЫХ ПОСТОВ КОНКУРЕНТОВ")
    print("=" * 78)
    for i, s in enumerate(top, 1):
        snippet = " ".join(s.post.text.split())[:70]
        print(f"\n{i:>2}. score={s.score:6.2f}  [{s.post.channel}]  {s.url}")
        print(f"    Xn={s.xn:.2f}  Rn={s.rn:.2f}  Fn={s.fn:.2f}  recency={s.recency:.2f}")
        print(f"    views={s.post.views}  reactions={s.post.reactions_total}  forwards={s.post.forwards}")
        print(f"    «{snippet}{'…' if len(s.post.text) > 70 else ''}»")


async def cmd_run() -> None:
    config.validate()
    since = datetime.now(timezone.utc) - timedelta(days=config.lookback_days)
    print(f"Каналов: {len(config.competitor_channels)} | окно: {config.lookback_days}д | "
          f"постов/канал: {config.posts_per_channel}")

    client = _build_client()
    await client.start()
    try:
        per_channel = await fetch_all(client, config.competitor_channels,
                                      config.posts_per_channel, since)
    finally:
        await client.disconnect()

    top = top_across_channels(per_channel, top_n=config.top_n)
    all_scored = [s for ch in per_channel for s in score_channel(ch)]
    saved = await save_scored(config.database_url, all_scored)

    _print_top(top)
    print(f"\nСохранено в БД: {saved} постов." if saved
          else "\nБД не настроена (DATABASE_URL пуст) — вывод только в консоль.")


def _selftest() -> None:
    """python tg_viral_parser.py selftest — проверка математики скоринга на моках."""
    now = datetime(2026, 6, 13, 12, 0, tzinfo=timezone.utc)

    def p(ch, mid, hrs, v, r, f):
        return PostMetrics(ch, mid, now - timedelta(hours=hrs), f"post {mid}", v, r, f, False)

    small = [p("smallch", i, 24 + i, 1000, 40, 5) for i in range(1, 9)]
    small.append(p("smallch", 99, 6, 4200, 380, 95))           # свежий выброс
    big = [p("bigch", i, 30 + i, 50000, 900, 60) for i in range(1, 9)]
    big.append(p("bigch", 50, 10, 61000, 1100, 80))
    top = top_across_channels([small, big], top_n=3, now=now)
    _print_top(top)
    assert top[0].post.channel == "smallch", "outlier маленького канала должен победить"
    print("\nselftest OK")


def main() -> None:
    parser = argparse.ArgumentParser(description="Парсер+скоринг виральных постов конкурентов в Telegram")
    parser.add_argument("command", nargs="?", default="run",
                        choices=["run", "login", "init-db", "selftest"],
                        help="run (по умолч.) | login | init-db | selftest")
    args = parser.parse_args()

    if args.command == "login":
        cmd_login()
    elif args.command == "init-db":
        asyncio.run(init_db(config.database_url))
    elif args.command == "selftest":
        _selftest()
    else:
        asyncio.run(cmd_run())


if __name__ == "__main__":
    main()
PARSER_EOF

cat > review_bot.py <<'BOT_EOF'
#!/usr/bin/env python3
"""
review_bot.py — модуль 2: ревью скоренных постов в Telegram + публикация.

Пайплайн: парсинг → скоринг (tg_viral_parser.py) → [ЭТОТ МОДУЛЬ: ревью в боте → публикация].

Бот берёт топ постов из таблицы parsed_posts (которую наполняет tg_viral_parser.py),
шлёт их владельцу карточками с inline-кнопками «✅ Одобрить / ❌ Отклонить»:

    • Одобрить → текст поста публикуется в твой канал (PUBLISH_CHANNEL),
                 review_status = 'published'. Если задан ANTHROPIC_API_KEY —
                 текст перед публикацией переписывается через Claude (свой пост,
                 а не дословная копия конкурента).
    • Отклонить → review_status = 'rejected'.

Авто-пуш: если задан REVIEW_DAILY_TIME (HH:MM UTC) — бот раз в день сам присылает
топ на ревью (как ручной /review). Пусто = только ручной /review.

Бот отвечает ТОЛЬКО владельцу (OWNER_TELEGRAM_ID) — остальные игнорируются.

────────────────────────────────────────────────────────────────────────────
УСТАНОВКА
────────────────────────────────────────────────────────────────────────────
    pip install -r requirements.txt   # telethon, asyncpg, python-dotenv, python-telegram-bot

.env (в дополнение к переменным tg_viral_parser.py):
────────────────────────── .env ──────────────────────────
    DATABASE_URL=postgresql://user:pass@host:5432/postgres   # ОБЯЗАТЕЛЕН для бота
    TELEGRAM_BOT_TOKEN=        # @BotFather (можно тот же бот, что шлёт дайджесты)
    OWNER_TELEGRAM_ID=         # твой numeric id (только он видит ревью)
    PUBLISH_CHANNEL=@my_channel   # куда публиковать одобренное (@username или -100…)
    REVIEW_BATCH=10            # сколько постов слать за один /review
    REVIEW_DAILY_TIME=06:00   # необязательно: ежедневный авто-пуш топа (HH:MM UTC)
    ANTHROPIC_API_KEY=        # необязательно: рерайт текста через Claude перед публикацией
    ANTHROPIC_MODEL=claude-sonnet-4-6   # модель рерайта (по умолч.)
───────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────────────
ЗАПУСК
────────────────────────────────────────────────────────────────────────────
    python review_bot.py            # long-running bot (polling)
    python review_bot.py selftest   # проверка форматирования карточки (без сети/БД)

В боте:
    /start    — проверка доступа
    /review   — прислать топ необработанных постов на ревью

ВАЖНО: бот должен быть АДМИНОМ канала PUBLISH_CHANNEL (иначе публиковать не сможет).
"""
from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, time as dtime, timezone
from typing import Any, Mapping

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("review-bot")


# ════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ════════════════════════════════════════════════════════════════════════════
class BotConfig:
    token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    owner_id: int = int(os.getenv("OWNER_TELEGRAM_ID", "0"))
    publish_channel: str = os.getenv("PUBLISH_CHANNEL", "")
    database_url: str = os.getenv("DATABASE_URL", "")
    review_batch: int = int(os.getenv("REVIEW_BATCH", "10"))
    # "HH:MM" UTC — ежедневный авто-пуш топа на ревью. Пусто = только ручной /review.
    daily_time: str = os.getenv("REVIEW_DAILY_TIME", "")
    # Рерайт текста через Claude перед публикацией. Пусто = публикуем verbatim.
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

    @classmethod
    def validate(cls) -> None:
        missing = []
        if not cls.token:
            missing.append("TELEGRAM_BOT_TOKEN")
        if not cls.owner_id:
            missing.append("OWNER_TELEGRAM_ID")
        if not cls.publish_channel:
            missing.append("PUBLISH_CHANNEL")
        if not cls.database_url:
            missing.append("DATABASE_URL")
        if missing:
            raise SystemExit("Не заданы в .env: " + ", ".join(missing))


# ════════════════════════════════════════════════════════════════════════════
#  PRESENTATION  (чистые функции — тестируемо без сети/БД/telegram)
# ════════════════════════════════════════════════════════════════════════════
def post_url(channel: str, message_id: int) -> str:
    return f"https://t.me/{str(channel).lstrip('@')}/{message_id}"


def card_text(row: Mapping[str, Any], snippet_len: int = 400) -> str:
    """Карточка поста для ревью. row — Record/dict из parsed_posts."""
    full = " ".join((row["text"] or "").split())
    snippet = full[:snippet_len]
    tail = "…" if len(full) > snippet_len else ""
    media = "🖼 медиа" if row["has_media"] else "📝 текст"
    body = f"{snippet}{tail}" if snippet else "(без текста — только медиа)"
    return (
        f"⭐️ score={row['score']:.2f}  ({media})\n"
        f"📡 {row['channel']}  →  {post_url(row['channel'], row['message_id'])}\n"
        f"👁 {row['views']}   ❤️ {row['reactions_total']}   🔁 {row['forwards']}\n"
        f"\n{body}"
    )


def publish_text(row: Mapping[str, Any]) -> str:
    """Что именно уйдёт в канал при одобрении.

    В parsed_posts хранится только текст поста (не сами медиа-файлы), поэтому
    публикуем текст как черновик. Если текста нет (чистое медиа) — публикуем
    ссылку на оригинал, чтобы человек докрутил вручную.
    """
    text = (row["text"] or "").strip()
    if text:
        return text
    return f"Источник (медиа без текста): {post_url(row['channel'], row['message_id'])}"


# ════════════════════════════════════════════════════════════════════════════
#  REWRITE  (Claude — переписать чужой пост в наш, перед публикацией)
# ════════════════════════════════════════════════════════════════════════════
REWRITE_SYSTEM = (
    "Ты — редактор Telegram-канала. На вход даётся текст чужого вирального поста "
    "конкурента. Перепиши его своими словами на русском как самостоятельный пост для "
    "нашего канала: сохрани цепляющий смысл и структуру (хук → польза → призыв), но не "
    "копируй формулировки дословно; убери чужой брендинг, ссылки и упоминания авторства. "
    "Верни ТОЛЬКО готовый текст поста, без пояснений и кавычек."
)


async def rewrite_text(original: str) -> str:
    """Переписать текст через Claude. Возвращает оригинал, если модель ответила пусто."""
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=BotConfig.anthropic_api_key)
    msg = await client.messages.create(
        model=BotConfig.anthropic_model,
        max_tokens=1024,
        system=REWRITE_SYSTEM,
        messages=[{"role": "user", "content": original}],
    )
    parts = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
    out = "\n".join(p.strip() for p in parts if p).strip()
    return out or original


async def build_publish_text(row: Mapping[str, Any]) -> str:
    """Что уйдёт в канал: рерайт через Claude, если задан ключ и есть авторский текст;
    иначе — verbatim (поведение по умолчанию)."""
    base = publish_text(row)
    if not BotConfig.anthropic_api_key:
        return base
    if not (row["text"] or "").strip():  # чистое медиа — рерайтить нечего
        return base
    return await rewrite_text(base)


def _rewrite_active(row: Mapping[str, Any]) -> bool:
    return bool(BotConfig.anthropic_api_key and (row["text"] or "").strip())


# ════════════════════════════════════════════════════════════════════════════
#  STORAGE  (asyncpg)
# ════════════════════════════════════════════════════════════════════════════
_FETCH_BATCH = """
select id, channel, message_id, posted_at, text, has_media,
       views, reactions_total, forwards, score, review_status
from parsed_posts
where review_status = 'new'
order by score desc
limit $1
"""

_FETCH_ONE = """
select id, channel, message_id, posted_at, text, has_media,
       views, reactions_total, forwards, score, review_status
from parsed_posts
where id = $1
"""

# Помечаем 'sent' только то, что ещё 'new' — защита от гонки между несколькими /review.
_MARK_SENT = "update parsed_posts set review_status='sent' where id = any($1::bigint[]) and review_status='new'"

# Финализируем статус только из необработанных ('new'|'sent') — повторный клик по
# старой кнопке не перезапишет уже опубликованное/отклонённое.
_SET_STATUS = """
update parsed_posts set review_status=$2
where id=$1 and review_status in ('new','sent')
returning id
"""


async def _connect():
    import asyncpg
    return await asyncpg.connect(BotConfig.database_url)


async def fetch_batch(limit: int) -> list[Mapping[str, Any]]:
    conn = await _connect()
    try:
        rows = await conn.fetch(_FETCH_BATCH, limit)
        ids = [r["id"] for r in rows]
        if ids:
            await conn.execute(_MARK_SENT, ids)
        return [dict(r) for r in rows]
    finally:
        await conn.close()


async def fetch_one(post_id: int) -> Mapping[str, Any] | None:
    conn = await _connect()
    try:
        row = await conn.fetchrow(_FETCH_ONE, post_id)
        return dict(row) if row else None
    finally:
        await conn.close()


async def set_status(post_id: int, status: str) -> bool:
    """True — если статус реально сменился (запись была необработанной)."""
    conn = await _connect()
    try:
        res = await conn.fetchrow(_SET_STATUS, post_id, status)
        return res is not None
    finally:
        await conn.close()


# ════════════════════════════════════════════════════════════════════════════
#  HANDLERS  (python-telegram-bot, async)
# ════════════════════════════════════════════════════════════════════════════
def _keyboard(post_id: int):
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Одобрить", callback_data=f"appr:{post_id}"),
        InlineKeyboardButton("❌ Отклонить", callback_data=f"rej:{post_id}"),
    ]])


def _is_owner(update) -> bool:
    user = update.effective_user
    return bool(user and user.id == BotConfig.owner_id)


async def cmd_start(update, context) -> None:
    if not _is_owner(update):
        return
    await update.message.reply_text(
        "Бот ревью виральных постов. /review — прислать топ необработанных постов на ревью."
    )


async def push_review_batch(bot) -> int:
    """Прислать владельцу очередную пачку необработанных постов карточками.
    Общая логика для ручного /review и ежедневного авто-пуша. Возвращает число постов."""
    rows = await fetch_batch(BotConfig.review_batch)
    if not rows:
        return 0
    await bot.send_message(chat_id=BotConfig.owner_id, text=f"На ревью: {len(rows)} постов ↓")
    for row in rows:
        await bot.send_message(
            chat_id=BotConfig.owner_id,
            text=card_text(row),
            reply_markup=_keyboard(row["id"]),
            disable_web_page_preview=False,
        )
    return len(rows)


async def cmd_review(update, context) -> None:
    if not _is_owner(update):
        return
    n = await push_review_batch(context.bot)
    if n == 0:
        await update.message.reply_text("Новых постов на ревью нет.")


async def daily_review_job(context) -> None:
    """JobQueue-колбэк: ежедневный авто-пуш топа на ревью."""
    try:
        n = await push_review_batch(context.bot)
        logger.info("daily review push: %s posts", n)
    except Exception:
        logger.exception("daily review job failed")


async def on_callback(update, context) -> None:
    query = update.callback_query
    if not _is_owner(update):
        await query.answer("Нет доступа.", show_alert=True)
        return
    await query.answer()

    action, _, raw_id = query.data.partition(":")
    post_id = int(raw_id)

    if action == "rej":
        changed = await set_status(post_id, "rejected")
        await query.edit_message_text(
            ("❌ Отклонено.\n\n" if changed else "ℹ️ Уже обработано.\n\n") + (query.message.text or "")
        )
        return

    if action == "appr":
        row = await fetch_one(post_id)
        if row is None:
            await query.edit_message_text("ℹ️ Пост не найден.")
            return
        if row["review_status"] not in ("new", "sent"):
            await query.edit_message_text("ℹ️ Уже обработано.\n\n" + (query.message.text or ""))
            return
        try:
            text_to_publish = await build_publish_text(row)
        except Exception as e:  # рерайт упал — не публикуем чужой текст молча, оставляем кнопки
            logger.exception("rewrite failed for post %s", post_id)
            await query.edit_message_text(
                f"⚠️ Рерайт через Claude не удался: {e}\n\n" + (query.message.text or ""),
                reply_markup=_keyboard(post_id),
            )
            return
        try:
            await context.bot.send_message(chat_id=BotConfig.publish_channel, text=text_to_publish)
        except Exception as e:  # права бота / неверный канал — не теряем статус, сообщаем
            logger.exception("publish failed for post %s", post_id)
            await query.edit_message_text(
                f"⚠️ Не удалось опубликовать: {e}\n\n" + (query.message.text or ""),
                reply_markup=_keyboard(post_id),
            )
            return
        await set_status(post_id, "published")
        note = " (переписано Claude)" if _rewrite_active(row) else ""
        await query.edit_message_text(f"✅ Опубликовано{note}.\n\n" + (query.message.text or ""))


# ════════════════════════════════════════════════════════════════════════════
#  ENTRYPOINT
# ════════════════════════════════════════════════════════════════════════════
def _parse_hhmm(s: str) -> dtime:
    """'06:30' → datetime.time(6, 30, UTC). Бросает ValueError на мусоре."""
    hh, mm = (int(x) for x in s.strip().split(":", 1))
    return dtime(hour=hh, minute=mm, tzinfo=timezone.utc)


def run() -> None:
    BotConfig.validate()
    from telegram.ext import Application, CommandHandler, CallbackQueryHandler

    app = Application.builder().token(BotConfig.token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("review", cmd_review))
    app.add_handler(CallbackQueryHandler(on_callback))

    if BotConfig.daily_time:
        app.job_queue.run_daily(daily_review_job, time=_parse_hhmm(BotConfig.daily_time))
        logger.info("daily review push scheduled at %s UTC", BotConfig.daily_time)

    logger.info(
        "review-bot started; owner=%s publish_channel=%s rewrite=%s",
        BotConfig.owner_id, BotConfig.publish_channel, bool(BotConfig.anthropic_api_key),
    )
    app.run_polling(allowed_updates=["message", "callback_query"])


def _selftest() -> None:
    """python review_bot.py selftest — проверка чистых функций представления."""
    row = {
        "id": 1, "channel": "smallch", "message_id": 99,
        "posted_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
        "text": "  Как мы выросли x10\nза месяц  ", "has_media": True,
        "views": 4200, "reactions_total": 380, "forwards": 95,
        "score": 40.44, "review_status": "new",
    }
    txt = card_text(row)
    assert "score=40.44" in txt
    assert "https://t.me/smallch/99" in txt
    assert "Как мы выросли x10 за месяц" in txt          # карточка схлопывает пробелы/переводы строк
    # публикация сохраняет авторское форматирование (только trim по краям)
    assert publish_text(row) == "Как мы выросли x10\nза месяц"

    media_only = {**row, "text": ""}
    assert "медиа без текста" in publish_text(media_only)
    assert post_url("@ch", 5) == "https://t.me/ch/5"

    # парсер времени для ежедневного авто-пуша
    assert _parse_hhmm("06:30") == dtime(6, 30, tzinfo=timezone.utc)

    # рерайт выключен (нет ключа) → build_publish_text возвращает verbatim, без сети к Claude
    import asyncio
    BotConfig.anthropic_api_key = ""
    assert asyncio.run(build_publish_text(row)) == "Как мы выросли x10\nза месяц"
    assert _rewrite_active(row) is False

    print(card_text(row))
    print("\nselftest OK")


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "selftest":
        _selftest()
    else:
        run()


if __name__ == "__main__":
    main()
BOT_EOF

chmod +x tg_viral_parser.py review_bot.py 2>/dev/null || true
ok "Файлы проекта на месте"

if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else die "Docker Compose не найден. Установи Docker Desktop и запусти его."; fi

bold "[1/8] Проверяю Docker…"
docker info >/dev/null 2>&1 || die "Docker-демон не запущен. Открой Docker Desktop, дождись 'Engine running', повтори."
ok "Docker работает ($DC)"

bold "[2/8] Проверяю .env…"
if [[ ! -f .env ]]; then
  cp .env.example .env
  warn ".env создан из шаблона: $(pwd)/.env"
  warn "Заполни его (в VS Code открой $APP_DIR/.env) и запусти скрипт снова."
  warn "Минимум: TELEGRAM_BOT_TOKEN, OWNER_TELEGRAM_ID, PUBLISH_CHANNEL, DATABASE_URL, TG_API_ID, TG_API_HASH, COMPETITOR_CHANNELS."
  exit 0
fi
# .env читаем БЕЗ source — значения могут содержать спецсимволы/кавычки.
get_env() { sed -n "s/^$1=//p" .env | tail -n1; }
ok ".env найден"

bold "[3/8] Проверяю обязательные переменные…"
missing=()
for v in TELEGRAM_BOT_TOKEN OWNER_TELEGRAM_ID PUBLISH_CHANNEL DATABASE_URL TG_API_ID TG_API_HASH COMPETITOR_CHANNELS; do
  [[ -n "$(get_env "$v")" ]] || missing+=("$v")
done
(( ${#missing[@]} )) && die "Не заполнены в .env: ${missing[*]}"
ok "Все обязательные переменные на месте"

bold "[4/8] Собираю Docker-образ…"
$DC build
ok "Образ собран"

bold "[5/8] Проверяю TG_SESSION_STRING…"
if [[ -z "$(get_env TG_SESSION_STRING)" ]]; then
  warn "TG_SESSION_STRING пуст — запускаю интерактивный login (введи номер ОТДЕЛЬНОГО аккаунта и код из Telegram)."
  $DC run --rm tg-viral-parser tg_viral_parser.py login
  warn "Скопируй строку выше в .env как TG_SESSION_STRING= и запусти скрипт снова."
  exit 0
fi
ok "Session string задан"

bold "[6/8] Создаю таблицу parsed_posts (init-db)…"
$DC run --rm tg-viral-parser tg_viral_parser.py init-db
ok "БД готова"

bold "[7/8] Прогоняю парсер (парсинг + скоринг + сохранение)…"
$DC run --rm tg-viral-parser
ok "Парсер отработал"

bold "[8/8] Поднимаю review-бот…"
$DC up -d tg-viral-review-bot
ok "review-бот запущен"

echo
bold "Готово. Дальше:"
echo "  • В Telegram владельцу: /start → /review"
echo "  • Логи бота:          (cd $APP_DIR && $DC logs -f tg-viral-review-bot)"
echo "  • Повторный парсинг:  (cd $APP_DIR && $DC run --rm tg-viral-parser)"
echo "  • Остановить бот:     (cd $APP_DIR && $DC down)"
