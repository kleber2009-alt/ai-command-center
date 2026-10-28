"""Исследование перед планом: что реально залетает в Threads у доноров и по темам.

Каждое утро (05:00 МСК, задача `research`) собираем через Apify свежие посты
аккаунтов-доноров (FUNNEL_DONORS) и топ поиска по ключевым словам
(FUNNEL_RESEARCH_QUERIES), считаем относительную виральность и кладём в
viral_posts со статусом `research`. Лучшие посты разворачиваем в ветку целиком
(режим «Post by Link»), чтобы агенты видели структуру, а не только хук.

Виральность относительная (как во всём приложении): xn = вовлечённость поста /
медиана вовлечённости автора (для поиска — медиана выборки по ключевому слову).
Вовлечённость = лайки + 2·ответы + 3·репосты + 3·шеры + 2·цитаты: шеры и ответы
весят больше лайков (метрика победителя в скилле — «шеры + комментарии»).

Актор: futurizerush/meta-threads-scraper (APIFY_THREADS_ACTOR), режимы user /
search / post_link. Проверка чистой логики:  python -m app.funnel.research
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import median

from app.config import settings

log = logging.getLogger("funnel.research")

DEFAULT_ACTOR = "futurizerush/meta-threads-scraper"
PROVEN_XN = 2.0          # пост в 2+ раза сильнее обычного у автора — «доказанный» сигнал
THREAD_EXPAND_TOP = 5    # сколько лучших постов разворачивать в ветку целиком


@dataclass
class Post:
    code: str
    author: str
    text: str
    url: str
    published_at: datetime | None
    likes: int = 0
    replies: int = 0
    reposts: int = 0
    shares: int = 0
    quotes: int = 0
    views: int = 0
    query: str = ""          # ключевое слово, если пост из поиска

    @property
    def engagement(self) -> int:
        return self.likes + 2 * self.replies + 3 * self.reposts + 3 * self.shares + 2 * self.quotes


def _int(v) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def _dt(raw: dict) -> datetime | None:
    ts = raw.get("created_at_timestamp")
    if ts:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc)
    s = raw.get("created_at")
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def normalize(raw: dict, query: str = "") -> Post | None:
    if raw.get("record_type") not in (None, "post"):
        return None
    code = str(raw.get("post_code") or raw.get("post_url") or "")
    text = str(raw.get("text_content") or "")
    if not code or not text.strip():
        return None
    return Post(
        code=code, author=str(raw.get("username") or raw.get("requested_username") or ""),
        text=text, url=str(raw.get("post_url") or ""), published_at=_dt(raw),
        likes=_int(raw.get("like_count")), replies=_int(raw.get("reply_count")),
        reposts=_int(raw.get("repost_count")), shares=_int(raw.get("share_count")),
        quotes=_int(raw.get("quote_count")), views=_int(raw.get("view_count")), query=query,
    )


def score_batch(posts: list[Post], group_by_author: bool = True) -> dict[str, tuple[float, float]]:
    """code → (xn, медиана группы). Группа — автор (доноры) или вся выборка (поиск)."""
    groups: dict[str, list[Post]] = {}
    for p in posts:
        groups.setdefault(p.author if group_by_author else (p.query or "_"), []).append(p)
    out: dict[str, tuple[float, float]] = {}
    for items in groups.values():
        med = median([p.engagement for p in items]) if items else 0
        base = med if med > 0 else 1.0
        for p in items:
            out[p.code] = (round(p.engagement / base, 2), float(med))
    return out


def category(xn: float) -> str:
    if xn >= settings.xn_category_a:
        return "A"
    if xn >= settings.xn_category_b:
        return "B"
    return "C" if xn >= settings.xn_category_c else "D"


# ── Apify ────────────────────────────────────────────────────────────────────
def _run(run_input: dict) -> list[dict]:
    if not settings.apify_token:
        raise RuntimeError("APIFY_TOKEN не задан — исследование Threads невозможно.")
    from apify_client import ApifyClient

    client = ApifyClient(settings.apify_token)
    actor = settings.apify_threads_actor or DEFAULT_ACTOR
    run = client.actor(actor).call(run_input=run_input)
    # apify-client 3.x возвращает модель Run, 1.x/2.x — dict.
    if isinstance(run, dict):
        status, dataset_id = run.get("status"), run.get("defaultDatasetId")
    else:
        status, dataset_id = getattr(run, "status", None), getattr(run, "default_dataset_id", None)
    if run is None or not dataset_id:
        raise RuntimeError(f"Apify: запуск {actor} не вернул данные")
    if str(getattr(status, "value", status) or "").upper() not in ("SUCCEEDED", ""):
        log.warning("Apify run %s finished with status %s", actor, status)
    return [dict(i) for i in client.dataset(dataset_id).iterate_items()]


def fetch_users(usernames: list[str], max_posts: int = 40) -> list[Post]:
    if not usernames:
        return []
    items = _run({"mode": "user", "usernames": usernames[:20], "max_posts": max(10, max_posts)})
    return [p for p in (normalize(i) for i in items) if p]


def fetch_search(keywords: list[str], max_posts: int = 30) -> list[Post]:
    out: list[Post] = []
    for kw in keywords:
        items = _run({"mode": "search", "keywords": [kw], "max_posts": max(10, max_posts),
                      "search_filter": "top", "start_date": "30 days"})
        out += [p for p in (normalize(i, kw) for i in items) if p]
    return out


def fetch_thread_body(url: str) -> list[str]:
    """Пост по ссылке → тексты постов автора в этой ветке по порядку (вся ветка, не только хук)."""
    items = _run({"mode": "post_link", "post_links": [url], "max_posts": 15})
    posts = [p for p in (normalize(i) for i in items) if p]
    if not posts:
        return []
    author = posts[0].author
    mine = [p for p in posts if p.author == author]
    mine.sort(key=lambda p: p.published_at or datetime.min.replace(tzinfo=timezone.utc))
    return [p.text for p in mine]


CONTINUATION_GAP = timedelta(seconds=120)   # автопостинг выкладывает пост 2/N через ~13 с после хука
MIN_AGE = timedelta(hours=20)               # моложе — ещё не набрал охват, сравнивать рано


def drop_continuations(posts: list[Post]) -> list[Post]:
    """Оставить только первые посты веток: продолжения (2/N…) выходят у того же автора
    через секунды после хука и набирают единицы лайков — они занижают медиану."""
    out: list[Post] = []
    by_author: dict[str, list[Post]] = {}
    for p in posts:
        by_author.setdefault(p.author, []).append(p)
    for items in by_author.values():
        items.sort(key=lambda p: p.published_at or datetime.min.replace(tzinfo=timezone.utc))
        prev: datetime | None = None
        for p in items:
            if p.published_at and prev and p.published_at - prev <= CONTINUATION_GAP:
                prev = p.published_at
                continue
            prev = p.published_at
            out.append(p)
    return out


def fresh(posts: list[Post], days: int = 30, now: datetime | None = None) -> list[Post]:
    """Посты за `days` дней, но не моложе суток; продолжения веток отброшены."""
    now = now or datetime.now(timezone.utc)
    since, until = now - timedelta(days=days), now - MIN_AGE
    kept = [p for p in drop_continuations(posts)
            if p.published_at is None or since <= p.published_at <= until]
    return kept


def _selftest() -> None:
    raw = {"record_type": "post", "username": "anna", "post_code": "ABC", "post_url": "https://threads.com/@anna/post/ABC",
           "text_content": "ОФИГЕЛА от промпта", "created_at": "2026-10-20T10:00:00Z",
           "like_count": 100, "reply_count": 20, "repost_count": 5, "share_count": 10, "quote_count": 1}
    p = normalize(raw)
    assert p and p.engagement == 100 + 40 + 15 + 30 + 2 and p.published_at.year == 2026
    assert normalize({"record_type": "profile", "username": "x"}) is None
    posts = [Post(f"c{i}", "anna", "t", "", None, likes=10) for i in range(5)] + [Post("hit", "anna", "t", "", None, likes=80)]
    sc = score_batch(posts)
    assert sc["hit"][0] == 8.0 and sc["c0"][0] == 1.0
    assert category(8.0) == "A" and category(1.0) == "D"
    t0 = datetime(2026, 10, 20, 10, 0, tzinfo=timezone.utc)
    chain = [Post("h", "a", "хук", "", t0, likes=50), Post("h2", "a", "пост 2", "", t0 + timedelta(seconds=13), likes=1),
             Post("h3", "a", "пост 3", "", t0 + timedelta(seconds=26), likes=1),
             Post("old", "a", "старый", "", t0 - timedelta(days=90), likes=900),
             Post("new", "a", "свежий", "", t0 + timedelta(days=8) - timedelta(hours=2), likes=2)]
    kept = {p.code for p in fresh(chain, now=t0 + timedelta(days=8))}
    assert kept == {"h"}, kept       # продолжения, старый закреп и пост младше суток — мимо
    print("research selftest OK")


if __name__ == "__main__":
    _selftest()
