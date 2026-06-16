"""scrape_worker — дискавери + (ре)скоринг (§5, §6, cron: 1ч / 3ч).

n8n: каждый 1ч → scrape; каждые 3ч → rescore. Здесь обе функции; CLI-аргумент
выбирает режим. Скоринг применяется к виралке со status='new'.
"""
from __future__ import annotations

import sys

from sqlalchemy import select

from app.core.database import session_scope
from app.models.competitor import Competitor
from app.models.viral_post import ViralPost
from app.services.scoring_service import ScoreInput, is_reply_target, score
from app.services.scraper_service import collect_and_store


def scrape() -> list[dict]:
    """Прогоняет дискавери по активным конкурентам (по платформам)."""
    results: list[dict] = []
    with session_scope() as db:
        comps = db.scalars(select(Competitor).where(Competitor.is_active.is_(True))).all()
        for c in comps:
            try:
                results.append(collect_and_store(db, c.platform, c.username, limit=50))
            except RuntimeError as e:
                results.append({"source": c.platform, "error": str(e)})
    return results


def rescore() -> dict:
    """Пересчёт xn_score/velocity/rank/category для свежей виралки + наполнение
    reply_targets свежими A/B (§6)."""
    from datetime import datetime, timezone

    from app.models.reply_target import ReplyTarget

    now = datetime.now(timezone.utc)
    scored = 0
    targets = 0
    with session_scope() as db:
        posts = db.scalars(select(ViralPost).where(ViralPost.status == "new")).all()
        for p in posts:
            hours = max((now - p.published_at).total_seconds() / 3600.0, 0.5) if p.published_at else 1.0
            res = score(ScoreInput(
                views=p.views or 0, likes=p.likes or 0, comments=p.comments or 0,
                reposts=p.reposts or 0, author_median_views=float(p.author_median_views or 0),
                author_followers=p.author_followers or 0, hours_since_post=hours,
                engagement_delta=(p.likes or 0) + (p.comments or 0) + (p.reposts or 0),
            ))
            p.xn_score, p.velocity, p.rank, p.category = res.xn_score, res.velocity, res.rank, res.category
            scored += 1
            if is_reply_target(res, hours) and p.external_id:
                exists = db.scalar(select(ReplyTarget).where(ReplyTarget.external_id == p.external_id))
                if not exists:
                    db.add(ReplyTarget(
                        external_id=p.external_id, author=p.author, text=p.text,
                        views=p.views, xn_score=res.xn_score, velocity=res.velocity,
                        posted_at=p.published_at, status="new",
                    ))
                    targets += 1
    return {"scored": scored, "reply_targets_added": targets}


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "scrape"
    print(rescore() if mode == "rescore" else scrape())


if __name__ == "__main__":
    main()
