"""FastAPI entrypoint — AI Threads Growth Agent.

Запуск (dev):  uvicorn app.main:app --reload --port 8080
Docs:          /docs  ·  Health: /health
Кроны дёргает n8n через воркеры (app/workers/*) и публичные эндпоинты (§14).
"""
from __future__ import annotations

from fastapi import FastAPI

from app.api import (
    accounts,
    analytics,
    competitors,
    content,
    publishing,
    replies,
    viral_posts,
)

app = FastAPI(
    title="AI Threads Growth Agent",
    version="0.1.0",
    description="Дискавери виралки → паттерны → адаптация → апрув → публикация + реплаи → аналитика → самообучение.",
)

for r in (viral_posts, content, replies, publishing, analytics, competitors, accounts):
    app.include_router(r.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}
