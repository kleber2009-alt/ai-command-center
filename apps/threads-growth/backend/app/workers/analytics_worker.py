"""analytics_worker — сбор инсайтов (cron 1ч) + warmup-tick и learning loop
(ежедн. 00:05) (§11, §12). CLI-аргумент выбирает режим: collect | daily.
"""
from __future__ import annotations

import sys

from sqlalchemy import select

from app.core.database import session_scope
from app.models.account import Account
from app.models.published_post import PublishedPost
from app.services.analytics_service import collect_for_post, snapshot_followers
from app.services.warmup_service import warmup_tick


def collect() -> dict:
    """Снимок инсайтов по всем опубликованным постам + снимок подписчиков."""
    posts_done = 0
    snaps = 0
    with session_scope() as db:
        for p in db.scalars(select(PublishedPost).where(PublishedPost.status == "published")):
            try:
                if collect_for_post(db, p.id):
                    posts_done += 1
            except Exception:  # noqa: BLE001 — один битый пост не роняет прогон
                pass
        for a in db.scalars(select(Account)):
            try:
                if snapshot_followers(db, a.id):
                    snaps += 1
            except Exception:  # noqa: BLE001
                pass
    return {"insights_collected": posts_done, "follower_snapshots": snaps}


def daily() -> dict:
    """Ежедневная петля: warmup-tick всем аккаунтам. (Пересчёт весов паттернов
    идёт по факту инсайтов через learning_service.apply_outcome — вызывается из
    аналитики, когда известен follow_conversion_rate.)"""
    with session_scope() as db:
        ramp = warmup_tick(db)
    return {"warmup_ticked": len(ramp), "stages": ramp}


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "collect"
    print(daily() if mode == "daily" else collect())


if __name__ == "__main__":
    main()
