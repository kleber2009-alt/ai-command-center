"""/api/replies — Reply Engine: цели, генерация, апрув (§9, §14)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.models.account import Account
from app.models.reply import Reply
from app.models.reply_target import ReplyTarget

router = APIRouter(prefix="/api/replies", tags=["replies"])


@router.get("/targets")
def list_targets(status: str = "new", limit: int = Query(50, le=200),
                 db: Session = Depends(get_session)):
    return db.scalars(
        select(ReplyTarget).where(ReplyTarget.status == status)
        .order_by(ReplyTarget.xn_score.desc().nullslast()).limit(limit)
    ).all()


@router.post("/generate/{target_id}")
def generate(target_id: int, account_id: int, db: Session = Depends(get_session)):
    from app.services.reply_service import generate_reply

    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(404, "account not found")
    try:
        reply = generate_reply(db, target_id, account_id, account.tone_of_voice or "")
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    if reply is None:
        raise HTTPException(422, "цель не найдена или качество реплая ниже порога")
    db.commit()
    return reply


@router.post("/{reply_id}/approve")
def approve(reply_id: int, db: Session = Depends(get_session)):
    reply = db.get(Reply, reply_id)
    if reply is None:
        raise HTTPException(404, "reply not found")
    reply.status = "approved"
    db.commit()
    return reply
