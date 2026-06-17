"""reply_worker — каждые 30мин: драфтит и (если режим позволяет) публикует реплаи
в пределах daily_reply_cap (§9, §11). Приоритет — высокий xn_score + рост.

На прогреве (warmup mode='manual') реплаи остаются draft → апрув в Telegram.
После — авто-публикация. Подсчёт суточного капа — по таблице replies за 24ч.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.database import session_scope
from app.models.account import Account
from app.models.reply import Reply
from app.models.reply_target import ReplyTarget
from app.services.publishing_service import publish_reply
from app.services.reply_service import generate_reply
from app.services.warmup_service import needs_reply_approval


def _replies_last_24h(db, account_id: int) -> int:
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    return db.scalar(
        select(func.count()).select_from(Reply)
        .where(Reply.account_id == account_id, Reply.created_at >= since)
    ) or 0


def run_replies() -> dict:
    drafted = 0
    published = 0
    with session_scope() as db:
        account = db.scalar(select(Account).where(Account.status != "paused"))
        if account is None:
            return {"error": "нет активного аккаунта"}

        used = _replies_last_24h(db, account.id)
        budget = max(0, (account.daily_reply_cap or 0) - used)
        if budget == 0:
            return {"account": account.handle, "budget": 0, "drafted": 0, "published": 0}

        targets = db.scalars(
            select(ReplyTarget).where(ReplyTarget.status == "new")
            .order_by(ReplyTarget.xn_score.desc().nullslast()).limit(budget)
        ).all()

        manual = needs_reply_approval(account.warmup_day)
        for t in targets:
            reply = generate_reply(db, t.id, account.id, account.tone_of_voice or "")
            if reply is None:
                t.status = "skipped"
                continue
            drafted += 1
            if not manual:                         # авто-режим — публикуем сразу
                try:
                    publish_reply(db, reply.id)
                    published += 1
                except RuntimeError:
                    pass                            # остаётся draft/failed, не роняем прогон
    return {"account": account.handle, "drafted": drafted, "published": published}


def main() -> None:
    print(run_replies())


if __name__ == "__main__":
    main()
