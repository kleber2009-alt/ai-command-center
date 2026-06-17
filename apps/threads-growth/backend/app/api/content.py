"""/api/content — Content Lab: генерация адаптаций + апрув-флоу (§8, §10, §14)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.models.generated_content import GeneratedContent

router = APIRouter(prefix="/api/content", tags=["content"])


@router.post("/generate/{viral_post_id}")
def generate(viral_post_id: int, account_id: int | None = None, count: int | None = None,
             db: Session = Depends(get_session)):
    from app.services.rewrite_service import generate_adaptations

    try:
        drafts = generate_adaptations(db, viral_post_id, account_id, count)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    db.commit()
    return {"generated": len(drafts), "drafts": drafts}


@router.get("/drafts")
def list_drafts(status: str = "draft", limit: int = Query(50, le=200),
                db: Session = Depends(get_session)):
    return db.scalars(
        select(GeneratedContent).where(GeneratedContent.status == status)
        .order_by(GeneratedContent.created_at.desc()).limit(limit)
    ).all()


@router.post("/{content_id}/approve")
def approve(content_id: int, db: Session = Depends(get_session)):
    gc = _get(db, content_id)
    if gc.status not in ("draft", "rejected"):
        raise HTTPException(409, f"нельзя одобрить из статуса '{gc.status}'")
    gc.status = "approved"
    db.commit()
    return gc


@router.post("/{content_id}/reject")
def reject(content_id: int, db: Session = Depends(get_session)):
    gc = _get(db, content_id)
    gc.status = "rejected"
    db.commit()
    return gc


def _get(db: Session, content_id: int) -> GeneratedContent:
    gc = db.get(GeneratedContent, content_id)
    if gc is None:
        raise HTTPException(404, "content not found")
    return gc
