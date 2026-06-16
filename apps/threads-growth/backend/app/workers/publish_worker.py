"""publish_worker — каждые 30мин: публикует scheduled-контент, чьё время настало
(§10). Жёсткий гейт approved/scheduled зашит в publishing_service.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import session_scope
from app.models.generated_content import GeneratedContent
from app.services.publishing_service import publish_content


def run_due() -> dict:
    now = datetime.now(timezone.utc)
    published = 0
    failed = 0
    with session_scope() as db:
        due = db.scalars(
            select(GeneratedContent).where(
                GeneratedContent.status == "scheduled",
                GeneratedContent.scheduled_at <= now,
            )
        ).all()
        for gc in due:
            try:
                publish_content(db, gc.id)
                published += 1
            except RuntimeError:
                failed += 1                         # сервис проставил status='failed'
    return {"published": published, "failed": failed}


def main() -> None:
    print(run_due())


if __name__ == "__main__":
    main()
