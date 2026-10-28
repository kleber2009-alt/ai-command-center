"""Расписание воронки: слоты, кластеры, доля перевыпусков (§3, §10 скилла).

Чистые функции, без БД и сети. Проверка:  python -m app.funnel.schedule
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class Cluster:
    name: str
    weight: float           # стартовая доля в плане (§3)
    templates: tuple[str, ...]  # подходящие шаблоны тела (§5)


CLUSTERS: dict[int, Cluster] = {
    1: Cluster("ИИ как психолог / зеркало", 0.25, ("A",)),
    2: Cluster("ИИ заменил дорогого специалиста", 0.20, ("B",)),
    3: Cluster("Контент-завод для создателей", 0.20, ("B", "D")),
    4: Cluster("Развлечение-самоирония", 0.10, ("C",)),
    5: Cluster("ИИ-ассистенты и автоматизация", 0.15, ("D", "B")),
    6: Cluster("Деньги и продажи", 0.10, ("A", "B")),
}

TEMPLATE_NAMES = {
    "A": "промпт-сессия",
    "B": "заменил специалиста",
    "C": "развлекательная пара",
    "D": "новость / инструмент",
}

REISSUE_SHARE = 0.35        # ~35% публикаций — перевыпуски (§10.2)
WARMUP_DAYS = 14            # первые 2 недели — только новые ветки


def default_weights() -> dict[int, float]:
    return {c: cl.weight for c, cl in CLUSTERS.items()}


def parse_slots(spec: str) -> list[time]:
    """'10:00,13:00,18:00' → [time(10), time(13), time(18)] (по возрастанию)."""
    out: list[time] = []
    for part in (spec or "").split(","):
        part = part.strip()
        if not part:
            continue
        hh, mm = (int(x) for x in part.split(":", 1))
        out.append(time(hour=hh, minute=mm))
    if not out:
        raise ValueError("пустой список слотов")
    return sorted(out)


def slot_datetimes(day: date, slots: list[time], tz: ZoneInfo) -> list[datetime]:
    return [datetime.combine(day, s, tzinfo=tz) for s in slots]


def reissue_quota(day: date, start: date | None, n_slots: int) -> int:
    """Сколько слотов дня отдать перевыпускам: 0 в первые 2 недели, дальше ~35%."""
    if start is None or (day - start).days < WARMUP_DAYS:
        return 0
    return int(round(n_slots * REISSUE_SHARE))


def normalize(weights: dict[int, float]) -> dict[int, float]:
    total = sum(max(0.0, w) for w in weights.values())
    if total <= 0:
        return default_weights()
    return {c: max(0.0, w) / total for c, w in weights.items()}


def pick_clusters(weights: dict[int, float], n: int, exclude: tuple[int, ...] = (),
                  seed: int | str | None = None) -> list[int]:
    """Взвешенный выбор n РАЗНЫХ кластеров (чередование кластеров в течение дня).
    Если исключили слишком много — повторы допускаются, но не подряд."""
    rng = random.Random(seed)
    pool = {c: w for c, w in normalize(weights).items() if c not in exclude and w > 0}
    if not pool:
        pool = {c: w for c, w in normalize(weights).items() if w > 0}
    out: list[int] = []
    available = dict(pool)
    while len(out) < n:
        if not available:
            available = {c: w for c, w in pool.items() if not out or c != out[-1]} or dict(pool)
        total = sum(available.values())
        r = rng.random() * total
        acc = 0.0
        chosen = next(iter(available))
        for c, w in sorted(available.items()):
            acc += w
            if r <= acc:
                chosen = c
                break
        out.append(chosen)
        available.pop(chosen, None)
    return out


def pick_template(cluster: int, seed: int | str | None = None) -> str:
    templates = CLUSTERS[cluster].templates
    return random.Random(seed).choice(templates)


def slot_choices(now: datetime, slots: list[time], tz: ZoneInfo, current: datetime | None,
                 days: int = 2, limit: int = 6) -> list[datetime]:
    """Варианты переноса ветки: стандартные слоты сегодня и в ближайшие дни,
    позже текущего момента (+10 мин на подготовку), кроме текущего слота."""
    local_now = now.astimezone(tz)
    out: list[datetime] = []
    for d in range(days + 1):
        day = local_now.date() + timedelta(days=d)
        for dt in slot_datetimes(day, slots, tz):
            if dt <= local_now + timedelta(minutes=10):
                continue
            if current is not None and abs((dt - current).total_seconds()) < 60:
                continue
            out.append(dt)
    return out[:limit]


def fmt_slot(dt: datetime, tz: ZoneInfo) -> str:
    """'пн 03.11 10:00' в часовом поясе воронки."""
    local = dt.astimezone(tz)
    wd = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"][local.weekday()]
    return f"{wd} {local:%d.%m %H:%M}"


def _selftest() -> None:
    tz = ZoneInfo("Europe/Moscow")
    slots = parse_slots("18:00, 10:00,13:00")
    assert slots == [time(10), time(13), time(18)]
    dts = slot_datetimes(date(2026, 11, 3), slots, tz)
    assert dts[0].isoformat() == "2026-11-03T10:00:00+03:00"

    start = date(2026, 11, 1)
    assert reissue_quota(date(2026, 11, 10), start, 3) == 0      # первые 2 недели
    assert reissue_quota(date(2026, 11, 15), start, 3) == 1      # ~35% от 3
    assert reissue_quota(date(2026, 11, 15), None, 3) == 0

    picked = pick_clusters(default_weights(), 3, seed="2026-11-03")
    assert len(picked) == 3 and len(set(picked)) == 3
    assert pick_clusters(default_weights(), 3, seed="x") == pick_clusters(default_weights(), 3, seed="x")
    assert pick_clusters(default_weights(), 2, exclude=(1, 2, 3, 4, 5), seed=1) == [6, 6]
    assert 4 not in pick_clusters(default_weights(), 3, exclude=(4,), seed=7)
    # Частоты на большом числе дней близки к весам.
    counts = {c: 0 for c in CLUSTERS}
    for i in range(3000):
        counts[pick_clusters(default_weights(), 1, seed=i)[0]] += 1
    assert counts[1] > counts[4] and counts[1] > counts[6]

    assert pick_template(4) == "C"
    now = datetime(2026, 11, 3, 12, 55, tzinfo=tz)
    choices = slot_choices(now, slots, tz, current=datetime(2026, 11, 3, 18, 0, tzinfo=tz))
    assert choices[0] == datetime(2026, 11, 4, 10, 0, tzinfo=tz)  # 13:00 уже близко, 18:00 — текущий
    assert fmt_slot(choices[0], tz) == "ср 04.11 10:00"
    print("schedule selftest OK")


if __name__ == "__main__":
    _selftest()
