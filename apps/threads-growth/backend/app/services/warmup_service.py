"""Warmup Ramp + caps (§11). Чистая лестница + применение к accounts.

Свежий аккаунт не льёт полный объём с первого дня (антибот, §0). Крон
ежедневно зовёт warmup_tick → инкремент warmup_day → пересчёт капов и режима.
Проверка лестницы:  python -m app.services.warmup_service
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.account import Account


@dataclass(frozen=True)
class RampStage:
    min_day: int
    posts: int
    replies: int
    mode: str  # manual | approve_posts | auto_selective | auto


# §11. Отсортировано по min_day по возрастанию.
RAMP: list[RampStage] = [
    RampStage(1, 2, 5, "manual"),          # день 1–3 — ручной апрув всего
    RampStage(4, 4, 10, "approve_posts"),  # день 4–7 — апрув постов, авто-реплаи
    RampStage(8, 5, 20, "auto_selective"), # неделя 2 — авто + выборочный апрув
    RampStage(15, 7, 30, "auto"),          # неделя 3 — авто
    RampStage(22, 10, 50, "auto"),         # неделя 4+ — полный режим
]


def stage_for_day(warmup_day: int) -> RampStage:
    chosen = RAMP[0]
    for stage in RAMP:
        if warmup_day >= stage.min_day:
            chosen = stage
    return chosen


def caps_for_day(warmup_day: int) -> tuple[int, int]:
    s = stage_for_day(warmup_day)
    return s.posts, s.replies


def needs_post_approval(warmup_day: int) -> bool:
    return stage_for_day(warmup_day).mode in ("manual", "approve_posts", "auto_selective")


def needs_reply_approval(warmup_day: int) -> bool:
    return stage_for_day(warmup_day).mode == "manual"


def warmup_tick(db: Session, account_id: int | None = None) -> list[dict]:
    """Инкрементит warmup_day и обновляет капы/статус. account_id=None → все
    не-paused аккаунты. Возвращает сводку по затронутым."""
    stmt = select(Account).where(Account.status != "paused")
    if account_id is not None:
        stmt = select(Account).where(Account.id == account_id)
    out: list[dict] = []
    for acc in db.scalars(stmt):
        acc.warmup_day = (acc.warmup_day or 1) + 1
        acc.daily_post_cap, acc.daily_reply_cap = caps_for_day(acc.warmup_day)
        acc.status = "active" if acc.warmup_day >= 4 else "warmup"
        out.append({
            "account_id": acc.id, "warmup_day": acc.warmup_day,
            "daily_post_cap": acc.daily_post_cap, "daily_reply_cap": acc.daily_reply_cap,
            "mode": stage_for_day(acc.warmup_day).mode,
        })
    db.flush()
    return out


def _selftest() -> None:
    assert caps_for_day(1) == (2, 5)
    assert caps_for_day(5) == (4, 10)
    assert caps_for_day(10) == (5, 20)
    assert caps_for_day(18) == (7, 30)
    assert caps_for_day(40) == (10, 50)
    assert needs_post_approval(1) and not needs_reply_approval(5)
    assert not needs_post_approval(30)
    print("warmup_service selftest OK")


if __name__ == "__main__":
    _selftest()
