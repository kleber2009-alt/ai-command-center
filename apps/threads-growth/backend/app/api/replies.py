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


@router.get("")
def list_replies(status: str = "draft", limit: int = Query(50, le=200),
                 db: Session = Depends(get_session)):
    """Реплаи на ревью с инфой о цели (для мини-аппы / дашборда)."""
    rows = db.execute(
        select(Reply.id, Reply.account_id, Reply.text, Reply.status,
               ReplyTarget.author, ReplyTarget.text, ReplyTarget.xn_score)
        .join(ReplyTarget, Reply.target_id == ReplyTarget.id)
        .where(Reply.status == status)
        .order_by(ReplyTarget.xn_score.desc().nullslast()).limit(limit)
    ).all()
    return [
        {"id": r[0], "account_id": r[1], "text": r[2], "status": r[3],
         "target_author": r[4], "target_text": r[5], "xn_score": r[6]}
        for r in rows
    ]


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


@router.post("/{reply_id}/skip")
def skip(reply_id: int, db: Session = Depends(get_session)):
    """Реплай → rejected, цель → skipped (§9)."""
    from sqlalchemy import update

    reply = db.get(Reply, reply_id)
    if reply is None:
        raise HTTPException(404, "reply not found")
    reply.status = "rejected"
    if reply.target_id:
        db.execute(update(ReplyTarget).where(ReplyTarget.id == reply.target_id).values(status="skipped"))
    db.commit()
    return {"id": reply_id, "status": "rejected"}


@router.post("/{reply_id}/publish-now")
def publish_now(reply_id: int, db: Session = Depends(get_session)):
    """Approve (если черновик) + немедленная публикация реплая (§10)."""
    from app.services.publishing_service import publish_reply

    reply = db.get(Reply, reply_id)
    if reply is None:
        raise HTTPException(404, "reply not found")
    if reply.status == "draft":
        reply.status = "approved"
        db.flush()
    try:
        pub = publish_reply(db, reply_id)
    except RuntimeError as e:
        db.commit()  # сохранить status='failed', если сервис его выставил
        raise HTTPException(409, str(e))
    db.commit()
    return pub
