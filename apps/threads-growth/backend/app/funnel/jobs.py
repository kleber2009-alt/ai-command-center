"""Задачи крона воронки. Расписание держит n8n (МСК):

  metrics   06:00            метрики веток за 14 дней + оценка тех, кому 48 ч
  plan      06:30            темы на слоты дня (и сообщение с планом)
  generate  07:00            ветки → карточки в тему «Threads»
  publish   каждые 5 мин     материалы за час до слота + выход по слотам 10/13/18
  comments  каждые 15 мин    черновики ответов первые 2 часа после выхода
  report    пн 09:00         недельный отчёт + новые веса кластеров
  token     вс 04:00         продление токена Threads (живёт 60 дней)
  seed      один раз         факты из брифа, доноры в competitors, стартовые веса

Каждая задача берёт advisory-lock Postgres: повторный запуск, пока идёт прошлый,
ничего не делает. Ветки обрабатываются в отдельных транзакциях — сбой одной не
откатывает остальные.
"""
from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime

from sqlalchemy import select, text

from app.core.database import get_engine, session_scope
from app.funnel import agents, service
from app.models.funnel import FunnelThread

log = logging.getLogger("funnel.jobs")


@contextmanager
def job_lock(name: str) -> Iterator[bool]:
    conn = get_engine().connect()
    key = {"k": f"threads-funnel:{name}"}
    try:
        got = bool(conn.execute(text("select pg_try_advisory_lock(hashtext(:k))"), key).scalar())
        conn.commit()
        try:
            yield got
        finally:
            if got:
                conn.execute(text("select pg_advisory_unlock(hashtext(:k))"), key)
                conn.commit()
    finally:
        conn.close()


def job_metrics(now: datetime | None = None) -> dict:
    now = now or service.now_utc()
    with session_scope() as db:
        collected = service.collect_metrics(db, now)
    with session_scope() as db:
        evaluated = service.evaluate(db, now)
    return {"metrics": collected, "evaluate": evaluated}


def job_plan(day: date | None = None, notify: bool = True) -> dict:
    day = day or service.local_today()
    with session_scope() as db:
        threads = service.plan_day(db, day)
        text_ = service.plan_text(db, day, threads)
        ids = [t.id for t in threads]
    if notify:
        service.notify(text_ + "\n\nКарточки пришлю после генерации.")
    return {"day": day.isoformat(), "threads": ids}


def job_generate(day: date | None = None) -> dict:
    day = day or service.local_today()
    with session_scope() as db:
        if not service.day_threads(db, day):
            service.plan_day(db, day)
    with session_scope() as db:
        ids = list(db.scalars(select(FunnelThread.id).where(
            FunnelThread.plan_date == day, FunnelThread.status.in_(("planned", "gen_failed")))
            .order_by(FunnelThread.slot_at)).all())
    done, failed = [], []
    for tid in ids:
        try:
            with session_scope() as db:
                service.generate_thread(db, db.get(FunnelThread, tid))
            done.append(tid)
        except (agents.AgentError, service.FunnelError, RuntimeError) as e:
            log.exception("generate %s failed", tid)
            with session_scope() as db:
                service.mark_generation_failed(db, tid, str(e))
            failed.append(tid)
    return {"day": day.isoformat(), "generated": done, "failed": failed}


def job_publish(now: datetime | None = None) -> dict:
    now = now or service.now_utc()
    with session_scope() as db:
        fallback = service.materials_deadline(db, now)
    with session_scope() as db:
        due = service.due_thread_ids(db, now)
    results = {}
    for tid in due:
        try:
            with session_scope() as db:
                results[tid] = service.process_due(db, tid, now)
        except Exception as e:  # noqa: BLE001 — одна ветка не роняет остальные
            log.exception("publish %s failed", tid)
            with session_scope() as db:
                t = db.get(FunnelThread, tid)
                if t is not None and t.status == "publishing":
                    # Неизвестно, сколько ушло: не повторяем автоматически.
                    service._publish_failed(db, t, f"сбой во время публикации: {e}. Проверьте ленту и нажмите ✅.")
            results[tid] = f"error: {e}"
    return {"materials_fallback": fallback, "due": results}


def job_comments(now: datetime | None = None) -> dict:
    with session_scope() as db:
        return service.poll_comments(db, now or service.now_utc())


def job_report(day: date | None = None) -> dict:
    day = day or service.local_today()
    with session_scope() as db:
        text_ = service.weekly(db, day, update_weights=True)
    service.notify(text_)
    return {"sent": True}


def job_token() -> dict:
    with session_scope() as db:
        return service.refresh_account_token(db)


def job_seed() -> dict:
    with session_scope() as db:
        return service.seed(db)


JOBS = {
    "metrics": job_metrics,
    "plan": job_plan,
    "generate": job_generate,
    "publish": job_publish,
    "comments": job_comments,
    "report": job_report,
    "token": job_token,
    "seed": job_seed,
}


# Ежедневные задачи: их сбой — в тему «Threads» (частые publish/comments — только в лог).
NOTIFY_ON_ERROR = ("metrics", "plan", "generate", "report", "token")


def run(name: str, **kwargs) -> dict:
    if name not in JOBS:
        raise ValueError(f"нет задачи {name}; есть: {', '.join(JOBS)}")
    with job_lock(name) as got:
        if not got:
            return {"job": name, "skipped": "уже выполняется"}
        try:
            return {"job": name, **JOBS[name](**kwargs)}
        except (service.FunnelError, agents.AgentError) as e:
            log.warning("job %s: %s", name, e)
            if name in NOTIFY_ON_ERROR:
                service.notify(f"⚠️ Задача «{name}» не выполнена: {service.cards.esc(str(e))}")
            return {"job": name, "error": str(e)}
