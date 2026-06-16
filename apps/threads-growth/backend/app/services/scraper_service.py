"""Competitor & Source Parser — Apify (§5).

Дискавери только через Apify (антибот/ToS — §0), не Playwright. Источники MVP:
Threads + X/Twitter + Reddit. Фильтр свежести <72ч, дедуп по embedding > 0.92.

apify-client импортируется лениво; без APIFY_TOKEN/актора collect_posts падает явно.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.llm import embed
from app.models.viral_post import ViralPost
from app.services.scoring_service import safe_median


@dataclass
class NormalizedPost:
    source: str
    external_id: str
    author: str
    author_url: str = ""
    text: str = ""
    url: str = ""
    published_at: datetime | None = None
    likes: int = 0
    comments: int = 0
    reposts: int = 0
    views: int = 0
    author_followers: int | None = None
    embedding: list[float] | None = field(default=None)


_ACTORS = {
    "threads": lambda: settings.apify_threads_actor,
    "twitter": lambda: settings.apify_twitter_actor,
    "reddit": lambda: settings.apify_reddit_actor,
}


def _client():
    if not settings.apify_token:
        raise RuntimeError("APIFY_TOKEN не задан — дискавери невозможна.")
    from apify_client import ApifyClient

    return ApifyClient(settings.apify_token)


def _parse_dt(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def normalize_post_data(source: str, raw: dict) -> NormalizedPost:
    """Маппинг сырого айтема Apify в общую форму. Поля разнятся по акторам —
    тут устойчивые алиасы; поправь под конкретный dataset."""
    return NormalizedPost(
        source=source,
        external_id=str(raw.get("id") or raw.get("pk") or raw.get("code") or raw.get("url") or ""),
        author=str(raw.get("username") or raw.get("author") or raw.get("ownerUsername") or ""),
        author_url=str(raw.get("authorUrl") or raw.get("profileUrl") or ""),
        text=str(raw.get("text") or raw.get("caption") or raw.get("title") or ""),
        url=str(raw.get("url") or raw.get("postUrl") or ""),
        published_at=_parse_dt(raw.get("publishedAt") or raw.get("timestamp") or raw.get("createdAt")),
        likes=int(raw.get("likesCount") or raw.get("likes") or raw.get("score") or 0),
        comments=int(raw.get("repliesCount") or raw.get("comments") or raw.get("numComments") or 0),
        reposts=int(raw.get("repostsCount") or raw.get("reposts") or raw.get("retweets") or 0),
        views=int(raw.get("viewsCount") or raw.get("views") or 0),
        author_followers=raw.get("authorFollowers") or raw.get("followers"),
    )


def collect_posts(source: str, query: str, limit: int = 100) -> list[NormalizedPost]:
    actor_id = _ACTORS.get(source, lambda: "")()
    if not actor_id:
        raise RuntimeError(f"Актор Apify для источника '{source}' не настроен в .env.")
    client = _client()
    run = client.actor(actor_id).call(run_input={"query": query, "resultsLimit": limit})
    items = client.dataset(run["defaultDatasetId"]).iterate_items()
    return [normalize_post_data(source, it) for it in items]


def collect_competitor_posts(source: str, username: str, limit: int = 30) -> list[NormalizedPost]:
    actor_id = _ACTORS.get(source, lambda: "")()
    if not actor_id:
        raise RuntimeError(f"Актор Apify для источника '{source}' не настроен в .env.")
    client = _client()
    run = client.actor(actor_id).call(run_input={"profiles": [username], "resultsLimit": limit})
    items = client.dataset(run["defaultDatasetId"]).iterate_items()
    return [normalize_post_data(source, it) for it in items]


def compute_author_median_views(posts: list[NormalizedPost], author: str) -> float:
    """Медиана просмотров по постам автора в выборке (§5)."""
    return safe_median([p.views for p in posts if p.author == author])


def _is_fresh(p: NormalizedPost, now: datetime) -> bool:
    return p.published_at is not None and p.published_at > now - timedelta(hours=settings.lookback_hours)


def _cosine(a, b) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def save_post_to_database(db: Session, p: NormalizedPost, author_median: float) -> ViralPost | None:
    """Сохраняет с дедупом (по external_id и по embedding > порога). Скоринг
    (xn/velocity/category) проставляет scoring-воркер отдельным проходом."""
    if not p.external_id:
        return None
    existing = db.scalar(select(ViralPost).where(ViralPost.external_id == p.external_id))
    if existing:
        return existing

    p.embedding = p.embedding or embed(p.text)
    if p.embedding is not None:  # семантический дедуп (§5)
        recent = db.scalars(
            select(ViralPost).where(ViralPost.embedding.isnot(None)).order_by(ViralPost.id.desc()).limit(500)
        )
        for r in recent:
            if r.embedding is not None and _cosine(p.embedding, r.embedding) >= settings.dedup_threshold:
                return None

    row = ViralPost(
        source=p.source, external_id=p.external_id, author=p.author, author_url=p.author_url,
        text=p.text, url=p.url, published_at=p.published_at, likes=p.likes, comments=p.comments,
        reposts=p.reposts, views=p.views, author_followers=p.author_followers,
        author_median_views=author_median, embedding=p.embedding, status="new",
    )
    db.add(row)
    db.flush()
    return row


def collect_and_store(db: Session, source: str, query: str, limit: int = 100) -> dict:
    """Полный шаг дискавери для одного источника/запроса (вызывается воркером)."""
    now = datetime.now(timezone.utc)
    posts = [p for p in collect_posts(source, query, limit) if _is_fresh(p, now)]
    saved = 0
    for p in posts:
        med = compute_author_median_views(posts, p.author)
        if save_post_to_database(db, p, med):
            saved += 1
    return {"source": source, "fetched": len(posts), "saved": saved}
