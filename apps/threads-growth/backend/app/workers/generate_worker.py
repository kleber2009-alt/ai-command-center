"""generate_worker — ежедневно 09:00: AI-анализ топ-виралки → 20 драфтов адаптаций
+ наполнение reply_targets (§7, §8, cron). Берёт A/B виралку со status='new/analyzed'.
"""
from __future__ import annotations

from sqlalchemy import select

from app.core.database import session_scope
from app.models.account import Account
from app.models.viral_post import ViralPost
from app.services.ai_analysis_service import analyze_and_store
from app.services.rewrite_service import generate_adaptations

DAILY_DRAFTS = 20


def generate_drafts(limit: int = DAILY_DRAFTS) -> dict:
    analyzed = 0
    drafts = 0
    with session_scope() as db:
        account = db.scalar(select(Account).where(Account.status != "paused"))
        account_id = account.id if account else None
        posts = db.scalars(
            select(ViralPost).where(ViralPost.category.in_(("A", "B")), ViralPost.status == "new")
            .order_by(ViralPost.rank.desc().nullslast()).limit(limit)
        ).all()
        for p in posts:
            analyze_and_store(db, p.id)      # извлекаем паттерн (модуль 3)
            analyzed += 1
            made = generate_adaptations(db, p.id, account_id)  # адаптации (модуль 4)
            drafts += len(made)
    return {"analyzed": analyzed, "drafts": drafts}


def main() -> None:
    print(generate_drafts())


if __name__ == "__main__":
    main()
