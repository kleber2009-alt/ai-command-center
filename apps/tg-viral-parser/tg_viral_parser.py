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
