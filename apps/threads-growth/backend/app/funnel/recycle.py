"""Замер и переупаковка (§10.2 скилла): победители, перевыпуски, архив, веса кластеров.

Чистые функции. Проверка:  python -m app.funnel.recycle

Правила:
  • Победитель — топ-10% по «шеры + ответы» за 30 дней ИЛИ лайки ≥ 3× медианы.
    Первые две недели медианы нет — сравниваем внутри недели.
  • Победитель возвращается через 3–10 дней с другим хуком и свежим приёмником.
  • Неудачник (ниже медианы лайков) — один раз пробуем другой хук, дальше архив.
  • Два перевыпуска подряд ниже медианы — тело в архив на 30–45 дней.
  • Веса кластеров на неделю: по ценности веток (подписки > клики > шеры+ответы).
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, datetime, timedelta

WINNER_TOP_SHARE = 0.10
WINNER_LIKES_MULT = 3.0
POPULATION_DAYS = 30
REISSUE_MIN_DAYS = 3
REISSUE_MAX_DAYS = 10
ARCHIVE_MIN_DAYS = 30
ARCHIVE_MAX_DAYS = 45
EVAL_AFTER_HOURS = 48

WEIGHT_FLOOR = 0.05
WEIGHT_CAP = 0.40
WEIGHT_LR = 0.3


@dataclass
class Stats:
    id: int
    published_at: datetime
    likes: int = 0
    replies: int = 0
    reposts: int = 0
    quotes: int = 0
    shares: int = 0
    views: int = 0
    clicks: int = 0
    joins: int = 0
    cluster: int = 0
    mechanic: str = ""


def engagement(s: Stats) -> int:
    """Метрика победителя — шеры + комментарии (§9), не лайки."""
    return s.shares + s.replies


def value(s: Stats) -> float:
    """Ценность ветки для воронки: главное — подписки и переходы в канал."""
    return 10 * s.joins + 3 * s.clicks + s.shares + s.replies


def median(xs: list[float]) -> float:
    ys = sorted(xs)
    if not ys:
        return 0.0
    mid = len(ys) // 2
    return float(ys[mid]) if len(ys) % 2 else (ys[mid - 1] + ys[mid]) / 2


def percentile(xs: list[float], q: float) -> float:
    """Ближайший ранг: q=0.9 → значение, выше которого ~10% выборки."""
    ys = sorted(xs)
    if not ys:
        return 0.0
    k = max(0, min(len(ys) - 1, int(round(q * (len(ys) - 1)))))
    return float(ys[k])


def population(target: Stats, pool: list[Stats], first_weeks: bool) -> list[Stats]:
    """С кем сравниваем: 30 дней до выхода ветки, а в первые 2 недели — её неделя."""
    if first_weeks:
        week = target.published_at.isocalendar()[:2]
        return [s for s in pool if s.published_at.isocalendar()[:2] == week]
    since = target.published_at - timedelta(days=POPULATION_DAYS)
    return [s for s in pool if since <= s.published_at <= target.published_at]


def verdict(target: Stats, pop: list[Stats]) -> str:
    """winner | below | neutral."""
    pop = pop or [target]
    if all(s.id != target.id for s in pop):
        pop = [*pop, target]
    eng = engagement(target)
    engs = [engagement(s) for s in pop]
    top = percentile(engs, 1 - WINNER_TOP_SHARE)
    med_likes = median([s.likes for s in pop])
    # > медианы — чтобы при ровном распределении (и при выборке из одной ветки)
    # «топ-10%» не накрывал всех.
    if len(pop) >= 2 and eng > 0 and eng >= top and eng > median(engs):
        return "winner"
    if med_likes > 0 and target.likes >= WINNER_LIKES_MULT * med_likes:
        return "winner"
    if target.likes < med_likes:
        return "below"
    return "neutral"


def family_decision(verdicts: list[str]) -> str:
    """Что делать с телом ветки после очередного выпуска: reissue | archive | hold.
    verdicts — вердикты выпусков тела по порядку (первый выпуск + перевыпуски)."""
    if not verdicts:
        return "hold"
    streak = 0
    for v in reversed(verdicts):
        if v != "below":
            break
        streak += 1
    if streak >= 2:
        return "archive"
    if "winner" in verdicts:
        return "reissue"
    if verdicts == ["below"]:
        return "reissue"          # неудачник: один раз другой хук
    if streak == 1:
        return "archive"          # другой хук не помог
    return "hold"


def reissue_window(last_published: date, today: date) -> str:
    """early (<3 дней) | open (3–10) | overdue (>10)."""
    days = (today - last_published).days
    if days < REISSUE_MIN_DAYS:
        return "early"
    return "open" if days <= REISSUE_MAX_DAYS else "overdue"


def archive_until(today: date, seed: int | str | None = None) -> date:
    return today + timedelta(days=random.Random(seed).randint(ARCHIVE_MIN_DAYS, ARCHIVE_MAX_DAYS))


def recompute_weights(old: dict[int, float], values: dict[int, list[float]]) -> dict[int, float]:
    """Новые веса кластеров: сдвиг к кластерам, чьи ветки ценнее среднего.
    Шаг WEIGHT_LR, вес в пределах [5%, 40%], сумма = 1."""
    all_vals = [v for vs in values.values() for v in vs]
    overall = sum(all_vals) / len(all_vals) if all_vals else 0.0
    total_old = sum(old.values()) or 1.0
    w = {c: x / total_old for c, x in old.items()}
    if overall > 0:
        for c in w:
            vs = values.get(c) or []
            perf = (sum(vs) / len(vs)) / overall if vs else 1.0
            w[c] = w[c] * (1 - WEIGHT_LR + WEIGHT_LR * min(perf, 3.0))
    for _ in range(10):  # нормировка с ограничениями сходится за пару итераций
        s = sum(w.values()) or 1.0
        w = {c: min(WEIGHT_CAP, max(WEIGHT_FLOOR, x / s)) for c, x in w.items()}
    s = sum(w.values())
    return {c: round(x / s, 4) for c, x in w.items()}


def _selftest() -> None:
    t0 = datetime(2026, 11, 2, 10, 0)
    pool = [Stats(i, t0 + timedelta(hours=i), likes=8, shares=1, replies=2) for i in range(1, 20)]
    hit = Stats(100, t0 + timedelta(days=1), likes=30, shares=40, replies=25)
    flop = Stats(101, t0 + timedelta(days=1), likes=2, shares=0, replies=0)
    mid = Stats(102, t0 + timedelta(days=1), likes=8, shares=1, replies=2)
    pop = population(hit, [*pool, hit, flop, mid], first_weeks=False)
    assert verdict(hit, pop) == "winner"
    assert verdict(flop, pop) == "below"
    assert verdict(mid, pop) == "neutral"
    # Только лайки ×3 от медианы — тоже победитель.
    likes_hit = Stats(103, t0 + timedelta(days=1), likes=25, shares=0, replies=0)
    assert verdict(likes_hit, population(likes_hit, [*pool, likes_hit], False)) == "winner"

    # Две ветки: явный лидер по шерам+ответам — победитель; одна — не с кем сравнить.
    a = Stats(300, t0, likes=10, shares=30, replies=20)
    b = Stats(301, t0 + timedelta(hours=3), likes=9, shares=1, replies=1)
    assert verdict(a, [a, b]) == "winner" and verdict(a, [a]) == "neutral"

    # Первые две недели — внутри недели.
    other_week = Stats(200, t0 + timedelta(days=8), likes=1)
    assert other_week not in population(hit, [*pool, hit, other_week], first_weeks=True)

    assert family_decision(["winner"]) == "reissue"
    assert family_decision(["winner", "below"]) == "reissue"
    assert family_decision(["winner", "below", "below"]) == "archive"
    assert family_decision(["below"]) == "reissue"
    assert family_decision(["below", "below"]) == "archive"
    assert family_decision(["below", "neutral"]) == "hold"
    assert family_decision(["neutral"]) == "hold"

    assert reissue_window(date(2026, 11, 1), date(2026, 11, 3)) == "early"
    assert reissue_window(date(2026, 11, 1), date(2026, 11, 4)) == "open"
    assert reissue_window(date(2026, 11, 1), date(2026, 11, 12)) == "overdue"
    until = archive_until(date(2026, 11, 1), seed=5)
    assert 30 <= (until - date(2026, 11, 1)).days <= 45

    old = {1: 0.25, 2: 0.20, 3: 0.20, 4: 0.10, 5: 0.15, 6: 0.10}
    new = recompute_weights(old, {1: [50, 40], 2: [5], 4: [0, 0]})
    assert abs(sum(new.values()) - 1) < 1e-3
    assert new[1] > old[1] and new[4] < old[4]
    assert all(WEIGHT_FLOOR - 1e-3 <= x <= WEIGHT_CAP + 1e-3 for x in new.values())
    assert recompute_weights(old, {}) == {c: round(x, 4) for c, x in old.items()}
    print("recycle selftest OK")


if __name__ == "__main__":
    _selftest()
