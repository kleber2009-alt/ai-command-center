"""Learning Engine — обновление весов content_patterns (§12). Чистое ядро + применение.

По факту публикации:
  - дал ПОДПИСКИ (followers_gained > 0 и conv ≥ порога) → weight *= 1.2
  - дал ПРОСМОТРЫ, но не подписки → reach_only=True, вес НЕ усиливаем
  - провалился (низкий xn нашего поста) → weight *= 0.85

Проверка математики:  python -m app.services.learning_service
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.content_pattern import ContentPattern

SUCCESS_MULT = 1.2
FAIL_MULT = 0.85
WEIGHT_MIN = 0.05
WEIGHT_MAX = 100.0
FAIL_XN = 0.5            # наш пост ниже половины нашей медианы → провал
MIN_CONVERSION = 0.001  # ниже — считаем reach-only (охват без подписок)


@dataclass
class Outcome:
    our_xn: float                 # наши просмотры / наша медиана
    followers_gained: int
    follow_conversion_rate: float


def _clamp(w: float) -> float:
    return max(WEIGHT_MIN, min(WEIGHT_MAX, w))


def classify_outcome(o: Outcome) -> str:
    """follower-gaining | reach-only | fail."""
    if o.followers_gained > 0 and o.follow_conversion_rate >= MIN_CONVERSION:
        return "follower-gaining"
    if o.our_xn < FAIL_XN:
        return "fail"
    return "reach-only"


def next_weight(weight: float, outcome_kind: str) -> tuple[float, bool]:
    """Возвращает (новый вес, reach_only). reach-only вес не трогает (§12)."""
    if outcome_kind == "follower-gaining":
        return _clamp(weight * SUCCESS_MULT), False
    if outcome_kind == "fail":
        return _clamp(weight * FAIL_MULT), False
    return _clamp(weight), True  # reach-only


def apply_outcome(db: Session, pattern_id: int, outcome: Outcome) -> dict | None:
    pattern = db.get(ContentPattern, pattern_id)
    if pattern is None:
        return None
    kind = classify_outcome(outcome)
    new_w, reach_only = next_weight(float(pattern.weight or 1.0), kind)
    pattern.weight = new_w
    pattern.reach_only = reach_only
    n = pattern.sample_count or 0
    prev_avg = float(pattern.avg_followers_gained or 0)
    pattern.avg_followers_gained = (prev_avg * n + outcome.followers_gained) / (n + 1)
    pattern.sample_count = n + 1
    # success_rate — доля прогонов, давших подписки.
    prev_rate = float(pattern.success_rate or 0)
    hit = 1.0 if kind == "follower-gaining" else 0.0
    pattern.success_rate = (prev_rate * n + hit) / (n + 1)
    db.flush()
    return {"pattern_id": pattern_id, "kind": kind, "weight": new_w, "reach_only": reach_only}


def _selftest() -> None:
    assert classify_outcome(Outcome(3.0, 50, 0.01)) == "follower-gaining"
    assert classify_outcome(Outcome(2.0, 0, 0.0)) == "reach-only"
    assert classify_outcome(Outcome(0.2, 0, 0.0)) == "fail"
    w, ro = next_weight(1.0, "follower-gaining")
    assert abs(w - 1.2) < 1e-9 and ro is False
    w, ro = next_weight(1.0, "reach-only")
    assert w == 1.0 and ro is True
    w, _ = next_weight(1.0, "fail")
    assert abs(w - 0.85) < 1e-9
    assert next_weight(0.01, "fail")[0] == WEIGHT_MIN  # clamp
    print("learning_service selftest OK")


if __name__ == "__main__":
    _selftest()
