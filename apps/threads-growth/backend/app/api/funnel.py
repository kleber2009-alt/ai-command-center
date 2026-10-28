"""/api/funnel — воронка Threads → Telegram: ветки, банк фактов, приёмники, веса.
/cron/funnel/<job> — запуск задач крона из n8n (заголовок X-Cron-Secret).

Основное управление — кнопками в Telegram; здесь — чтение и наполнение
справочников (для мини-аппы и ручных правок).
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.database import get_session
from app.funnel import jobs, service
from app.models.funnel import FunnelReceiver, FunnelThread, StoryFact

router = APIRouter(prefix="/api/funnel", tags=["funnel"])
cron_router = APIRouter(prefix="/cron/funnel", tags=["funnel-cron"])


def _thread_out(t: FunnelThread) -> dict:
    return {
        "id": t.id, "plan_date": t.plan_date, "slot_at": t.slot_at, "cluster": t.cluster,
        "template": t.template, "topic": t.topic, "hypothesis": t.hypothesis, "kind": t.kind,
        "parent_id": t.parent_id, "status": t.status, "verdict": t.verdict,
        "active_hook": t.active_hook, "hooks": t.hooks, "posts": service.full_posts(t, service.LINK_DISPLAY),
        "receiver_id": t.receiver_id, "link_url": t.link_url, "qa": t.qa, "metrics": t.metrics,
        "permalink": t.permalink, "published_at": t.published_at,
    }


@router.get("/threads")
def list_threads(day: date | None = None, status: str | None = None, limit: int = Query(50, le=200),
                 db: Session = Depends(get_session)):
    stmt = select(FunnelThread)
    if day:
        stmt = stmt.where(FunnelThread.plan_date == day)
    if status:
        stmt = stmt.where(FunnelThread.status == status)
    rows = db.scalars(stmt.order_by(FunnelThread.slot_at.desc()).limit(limit)).all()
    return [_thread_out(t) for t in rows]


@router.get("/threads/{thread_id}")
def get_thread(thread_id: int, db: Session = Depends(get_session)):
    t = db.get(FunnelThread, thread_id)
    if t is None:
        raise HTTPException(404, "thread not found")
    return _thread_out(t)


class FactIn(BaseModel):
    text: str
    kind: str = "fact"


@router.get("/story")
def list_facts(db: Session = Depends(get_session)):
    rows = db.scalars(select(StoryFact).order_by(StoryFact.id.desc())).all()
    return [{"id": r.id, "kind": r.kind, "text": r.text, "source": r.source, "verified": r.verified,
             "created_at": r.created_at} for r in rows]


@router.post("/story")
def add_fact(payload: FactIn, db: Session = Depends(get_session)):
    try:
        row = service.add_fact(db, payload.text, kind=payload.kind, source="manual")
    except service.FunnelError as e:
        raise HTTPException(400, str(e))
    db.commit()
    return {"id": row.id}


@router.delete("/story/{fact_id}")
def delete_fact(fact_id: int, db: Session = Depends(get_session)):
    row = db.get(StoryFact, fact_id)
    if row is None:
        raise HTTPException(404, "fact not found")
    db.delete(row)
    db.commit()
    return {"deleted": fact_id}


class ReceiverIn(BaseModel):
    url: str
    description: str = ""


@router.get("/receivers")
def list_receivers(db: Session = Depends(get_session)):
    rows = db.scalars(select(FunnelReceiver).order_by(FunnelReceiver.id.desc())).all()
    return [{**service.receiver_dict(r), "clicks": r.clicks, "joins": r.joins, "created_at": r.created_at}
            for r in rows]


@router.post("/receivers")
def add_receiver(payload: ReceiverIn, db: Session = Depends(get_session)):
    try:
        r = service.add_receiver(db, payload.url, payload.description)
    except service.FunnelError as e:
        raise HTTPException(400, str(e))
    db.commit()
    return service.receiver_dict(r)


@router.get("/weights")
def weights(db: Session = Depends(get_session)):
    return service.cluster_weights(db)


# ── Кроны n8n ────────────────────────────────────────────────────────────────
def _check_secret(x_cron_secret: str | None = Header(default=None)) -> None:
    if not settings.cron_secret:
        raise HTTPException(503, "CRON_SECRET не задан — HTTP-кроны выключены")
    if x_cron_secret != settings.cron_secret:
        raise HTTPException(401, "bad cron secret")


@cron_router.post("/{job}", status_code=202, dependencies=[Depends(_check_secret)])
def run_job(job: str, background: BackgroundTasks):
    if job not in jobs.JOBS:
        raise HTTPException(404, f"нет задачи {job}")
    # Ответ сразу: генерация веток идёт минуты, n8n не должен ждать.
    background.add_task(jobs.run, job)
    return {"started": job}
