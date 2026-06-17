"""/api/analytics — обзор KPI, инсайты поста, веса паттернов (§12, §14)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.models.account import Account
from app.models.content_pattern import ContentPattern
from app.models.post_analytics import PostAnalytics
from app.models.published_post import PublishedPost

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
def overview(db: Session = Depends(get_session)):
    from app.services.analytics_service import daily_delta

    accounts = db.scalars(select(Account)).all()
    published = db.scalar(select(func.count()).select_from(PublishedPost)) or 0
    return {
        "accounts": [
            {"id": a.id, "handle": a.handle, "status": a.status, "warmup_day": a.warmup_day,
             "follower_delta": daily_delta(db, a.id)}
            for a in accounts
        ],
        "published_total": published,
    }


@router.get("/posts/{published_post_id}")
def post_insights(published_post_id: int, db: Session = Depends(get_session)):
    if db.get(PublishedPost, published_post_id) is None:
        raise HTTPException(404, "published post not found")
    return db.scalars(
        select(PostAnalytics).where(PostAnalytics.published_post_id == published_post_id)
        .order_by(PostAnalytics.collected_at.asc())
    ).all()


@router.get("/patterns")
def patterns(limit: int = Query(50, le=200), db: Session = Depends(get_session)):
    return db.scalars(
        select(ContentPattern).order_by(ContentPattern.weight.desc()).limit(limit)
    ).all()
