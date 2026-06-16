"""Viral Scoring Engine — Xn-first (§6). Чистые функции, тестируется без сети/БД.

    xn_score = views / author_median_views                 # ГЛАВНЫЙ ранжир
    velocity = Δengagement / hours_since_post              # восходящий тренд
    engagement_rate = engagement / views
    rank = 0.6·xn + 0.3·norm(velocity) + 0.1·norm(engagement_rate)

Категории: A ≥ 5 · B 3–5 · C 1.5–3 · D < 1.5. Абсолютные лайки — только тайбрейкер.
Запусти проверку математики:  python -m app.services.scoring_service
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from statistics import median
from typing import Sequence

from app.config import settings


@dataclass
class ScoreInput:
    views: float
    likes: int = 0
    comments: int = 0
    reposts: int = 0
    author_median_views: float = 0.0
    author_followers: int = 0
    hours_since_post: float = 1.0
    engagement_delta: float = 0.0   # прирост engagement с прошлого замера (для velocity)


@dataclass
class ScoreResult:
    xn_score: float
    velocity: float
    engagement_rate: float
    follower_efficiency: float
    rank: float
    category: str


def safe_median(values: Sequence[float]) -> float:
    vals = [float(v) for v in values if v and v > 0]
    return median(vals) if vals else 1.0


def compute_author_median_views(recent_views: Sequence[float]) -> float:
    """Медиана по 20–30 последним постам автора (§5)."""
    return safe_median(recent_views)


def xn_score(views: float, author_median_views: float) -> float:
    base = author_median_views if author_median_views and author_median_views > 0 else 1.0
    return float(views) / base


def velocity(engagement_delta: float, hours_since_post: float) -> float:
    return float(engagement_delta) / max(hours_since_post, 0.5)


def categorize(xn: float) -> str:
    if xn >= settings.xn_category_a:
        return "A"
    if xn >= settings.xn_category_b:
        return "B"
    if xn >= settings.xn_category_c:
        return "C"
    return "D"


def _norm(value: float, hi: float) -> float:
    """Грубая нормировка в [0,1] относительно ориентира hi (clamp)."""
    if hi <= 0:
        return 0.0
    return max(0.0, min(1.0, value / hi))


def score(inp: ScoreInput, velocity_ref: float = 500.0, er_ref: float = 0.1) -> ScoreResult:
    """velocity_ref / er_ref — ориентиры нормировки (берутся из распределения окна)."""
    engagement = inp.likes + inp.comments + inp.reposts
    xn = xn_score(inp.views, inp.author_median_views)
    vel = velocity(inp.engagement_delta, inp.hours_since_post)
    er = engagement / inp.views if inp.views else 0.0
    fe = engagement / inp.author_followers if inp.author_followers else 0.0
    rank = (
        settings.rank_w_xn * xn
        + settings.rank_w_velocity * _norm(vel, velocity_ref)
        + settings.rank_w_engagement * _norm(er, er_ref)
    )
    return ScoreResult(xn, vel, er, fe, rank, categorize(xn))


def is_reply_target(result: ScoreResult, hours_since_post: float) -> bool:
    """Свежие A/B (<24ч), растущие по velocity → дополнительно в reply_targets (§6, §9)."""
    return result.category in ("A", "B") and hours_since_post < 24 and result.velocity > 0


# ── selftest ─────────────────────────────────────────────────────────────────
def _selftest() -> None:
    now = datetime.now(timezone.utc)
    assert categorize(6) == "A" and categorize(4) == "B"
    assert categorize(2) == "C" and categorize(1) == "D"
    # Выброс среднего автора обгоняет мегаблогера по xn.
    small = score(ScoreInput(views=9000, likes=300, comments=40, reposts=60,
                             author_median_views=1000, author_followers=5000,
                             hours_since_post=6, engagement_delta=400))
    big = score(ScoreInput(views=120000, likes=900, comments=50, reposts=70,
                           author_median_views=100000, author_followers=2_000_000,
                           hours_since_post=6, engagement_delta=200))
    assert small.xn_score > big.xn_score, "относительная виралка должна победить абсолют"
    assert small.category == "A"
    assert is_reply_target(small, 6) is True
    assert is_reply_target(small, 30) is False  # старше 24ч
    print(f"now={now:%Y-%m-%d}  small.xn={small.xn_score:.1f} ({small.category}) "
          f"rank={small.rank:.2f}  big.xn={big.xn_score:.2f} ({big.category})")
    print("scoring_service selftest OK")


if __name__ == "__main__":
    _selftest()
