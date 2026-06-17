"""/api/competitors — реестр источников для дискавери (§13)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.models.competitor import Competitor

router = APIRouter(prefix="/api/competitors", tags=["competitors"])


class CompetitorIn(BaseModel):
    platform: str
    username: str
    profile_url: str | None = None
    niche: str | None = None


@router.get("")
def list_competitors(active_only: bool = True, db: Session = Depends(get_session)):
    stmt = select(Competitor)
    if active_only:
        stmt = stmt.where(Competitor.is_active.is_(True))
    return db.scalars(stmt).all()


@router.post("")
def add_competitor(payload: CompetitorIn, db: Session = Depends(get_session)):
    comp = Competitor(**payload.model_dump())
    db.add(comp)
    db.commit()
    return comp


@router.delete("/{competitor_id}")
def deactivate(competitor_id: int, db: Session = Depends(get_session)):
    comp = db.get(Competitor, competitor_id)
    if comp is None:
        raise HTTPException(404, "competitor not found")
    comp.is_active = False
    db.commit()
    return {"id": competitor_id, "is_active": False}
