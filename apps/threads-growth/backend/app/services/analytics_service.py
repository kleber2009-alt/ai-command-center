"""Analytics — Threads Insights API (§12).

Снимки инсайтов опубликованного (T+1ч/+3ч/+6ч/+24ч/+72ч/+7д) + снимки
подписчиков для дневной дельты (KPI). engagement_rate и follow_conversion_rate
считаются здесь же — они кормят петлю обучения (reach-only vs follower-gaining).
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import decrypt_token
from app.models.account import Account
from app.models.follower_snapshot import FollowerSnapshot
from app.models.post_analytics import PostAnalytics
from app.models.published_post import PublishedPost

INSIGHT_METRICS = ["views", "likes", "replies", "reposts", "quotes", "clicks", "shares"]


def _http():
    import httpx

    return httpx.Client(base_url=settings.threads_api_base, timeout=30.0)


def fetch_post_insights(media_id: str, access_token: str) -> dict[str, int]:
    with _http() as h:
        r = h.get(f"/{media_id}/insights",
                  params={"metric": ",".join(INSIGHT_METRICS), "access_token": access_token})
        r.raise_for_status()
        out: dict[str, int] = {}
        for item in r.json().get("data", []):
            values = item.get("values") or [{}]
            out[item.get("name")] = int(values[0].get("value", 0) or 0)
        return out


def fetch_follower_count(user_id: str, access_token: str) -> int:
    with _http() as h:
        r = h.get(f"/{user_id}/threads_insights",
                  params={"metric": "followers_count", "access_token": access_token})
        r.raise_for_status()
        data = r.json().get("data", [])
        return int(data[0].get("total_value", {}).get("value", 0) or 0) if data else 0


def engagement_rate(views: int, likes: int, comments: int, reposts: int) -> float:
    return (likes + comments + reposts) / views if views else 0.0


def follow_conversion_rate(followers_gained: int, views: int) -> float:
    return followers_gained / views if views else 0.0


def collect_for_post(db: Session, published_post_id: int) -> PostAnalytics | None:
    """Один снимок инсайтов поста → post_analytics."""
    pub = db.get(PublishedPost, published_post_id)
    if pub is None or not pub.threads_post_id:
        return None
    account = db.get(Account, pub.account_id)
    if account is None:
        return None
    token = decrypt_token(account.access_token or "")
    data = fetch_post_insights(pub.threads_post_id, token)
    er = engagement_rate(data.get("views", 0), data.get("likes", 0),
                         data.get("replies", 0), data.get("reposts", 0))
    row = PostAnalytics(
        published_post_id=pub.id, views=data.get("views", 0), likes=data.get("likes", 0),
        comments=data.get("replies", 0), reposts=data.get("reposts", 0),
        quotes=data.get("quotes", 0), engagement_rate=er,
    )
    db.add(row)
    db.flush()
    return row


def snapshot_followers(db: Session, account_id: int) -> FollowerSnapshot | None:
    """Снимок числа подписчиков (KPI = дневная дельта)."""
    account = db.get(Account, account_id)
    if account is None or not account.threads_user_id:
        return None
    token = decrypt_token(account.access_token or "")
    count = fetch_follower_count(account.threads_user_id, token)
    snap = FollowerSnapshot(account_id=account_id, follower_count=count)
    db.add(snap)
    db.flush()
    return snap


def daily_delta(db: Session, account_id: int) -> int | None:
    """Дельта подписчиков между двумя последними снимками."""
    rows = db.scalars(
        select(FollowerSnapshot).where(FollowerSnapshot.account_id == account_id)
        .order_by(FollowerSnapshot.captured_at.desc()).limit(2)
    ).all()
    if len(rows) < 2:
        return None
    return (rows[0].follower_count or 0) - (rows[1].follower_count or 0)
