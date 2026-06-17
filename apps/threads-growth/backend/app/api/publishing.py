"""/api/publishing — расписание и публикация (§10, §14). Жёстко: только approved."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.models.generated_content import GeneratedContent

router = APIRouter(prefix="/api/publishing", tags=["publishing"])


@router.post("/schedule")
def schedule(content_id: int, when: datetime, db: Session = Depends(get_session)):
    gc = db.get(GeneratedContent, content_id)
    if gc is None:
        raise HTTPException(404, "content not found")
    if gc.status != "approved":
        raise HTTPException(409, "планировать можно только approved (§10)")
    gc.status = "scheduled"
    gc.scheduled_at = when
    db.commit()
    return gc


@router.post("/publish-now")
def publish_now(content_id: int, db: Session = Depends(get_session)):
    from app.services.publishing_service import publish_content

    try:
        pub = publish_content(db, content_id)
    except RuntimeError as e:
        db.commit()  # сохранить status='failed', если сервис его выставил
        raise HTTPException(409, str(e))
    db.commit()
    return pub


@router.get("/calendar")
def calendar(db: Session = Depends(get_session)):
    return db.scalars(
        select(GeneratedContent).where(GeneratedContent.status == "scheduled")
        .order_by(GeneratedContent.scheduled_at.asc())
    ).all()
