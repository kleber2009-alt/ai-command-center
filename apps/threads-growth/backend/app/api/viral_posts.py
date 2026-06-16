"""/api/viral-posts — лента дискавери (§14)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.models.viral_post import ViralPost

router = APIRouter(prefix="/api/viral-posts", tags=["viral-posts"])


@router.get("")
def list_viral_posts(
    db: Session = Depends(get_session),
    category: str | None = Query(None, description="A|B|C|D"),
    status: str | None = None,
    limit: int = Query(50, le=200),
):
    stmt = select(ViralPost).order_by(ViralPost.rank.desc().nullslast(), ViralPost.xn_score.desc().nullslast())
    if category:
        stmt = stmt.where(ViralPost.category == category)
    if status:
        stmt = stmt.where(ViralPost.status == status)
    return db.scalars(stmt.limit(limit)).all()


@router.get("/{post_id}")
def get_viral_post(post_id: int, db: Session = Depends(get_session)):
    post = db.get(ViralPost, post_id)
    if post is None:
        raise HTTPException(404, "viral post not found")
    return post


@router.post("/scrape")
def trigger_scrape(source: str = "threads", query: str = "", limit: int = 100,
                   db: Session = Depends(get_session)):
    """Синхронный прогон дискавери (в проде дёргается n8n-кроном через воркер)."""
    from app.services.scraper_service import collect_and_store

    try:
        return collect_and_store(db, source, query, limit)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
