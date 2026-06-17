"""/api/accounts — персоны-аккаунты + warmup-tick (§11, §14).

access_token при создании сразу шифруется (core.security) — в БД не попадает
открытым (§риски). В ответах токен не отдаётся.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.core.security import encrypt_token
from app.models.account import Account
from app.services.warmup_service import caps_for_day, warmup_tick

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


class AccountIn(BaseModel):
    handle: str
    threads_user_id: str | None = None
    access_token: str | None = None
    niche_id: int | None = None
    tone_of_voice: str | None = None


def _public(a: Account) -> dict:
    return {
        "id": a.id, "handle": a.handle, "threads_user_id": a.threads_user_id,
        "niche_id": a.niche_id, "tone_of_voice": a.tone_of_voice, "status": a.status,
        "warmup_day": a.warmup_day, "daily_post_cap": a.daily_post_cap,
        "daily_reply_cap": a.daily_reply_cap, "has_token": bool(a.access_token),
    }


@router.get("")
def list_accounts(db: Session = Depends(get_session)):
    return [_public(a) for a in db.scalars(select(Account)).all()]


@router.post("")
def create_account(payload: AccountIn, db: Session = Depends(get_session)):
    posts, replies = caps_for_day(1)
    acc = Account(
        handle=payload.handle, threads_user_id=payload.threads_user_id,
        access_token=encrypt_token(payload.access_token) if payload.access_token else None,
        niche_id=payload.niche_id, tone_of_voice=payload.tone_of_voice,
        status="warmup", warmup_day=1, daily_post_cap=posts, daily_reply_cap=replies,
    )
    db.add(acc)
    db.commit()
    return _public(acc)


@router.post("/{account_id}/warmup-tick")
def tick(account_id: int, db: Session = Depends(get_session)):
    if db.get(Account, account_id) is None:
        raise HTTPException(404, "account not found")
    result = warmup_tick(db, account_id)
    db.commit()
    return result[0] if result else {}
