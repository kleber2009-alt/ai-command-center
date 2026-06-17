"""FastAPI entrypoint — AI Threads Growth Agent.

Запуск (dev):  uvicorn app.main:app --reload --port 8080
Docs:          /docs  ·  Health: /health  ·  Mini App: /app
Кроны дёргает n8n через воркеры (app/workers/*); HTTP-API закрыт Telegram-
авторизацией мини-аппы (app/webapp/auth.py) — владельцу из Telegram WebApp.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.api import (
    accounts,
    analytics,
    competitors,
    content,
    publishing,
    replies,
    viral_posts,
)
from app.webapp.auth import verify_tma

app = FastAPI(
    title="AI Threads Growth Agent",
    version="0.1.0",
    description="Дискавери виралки → паттерны → адаптация → апрув → публикация + реплаи → аналитика → самообучение.",
)

# Все доменные роутеры закрыты Telegram-авторизацией: мини-аппа отдаётся публично,
# поэтому каждый /api/* требует валидный initData владельца.
for r in (viral_posts, content, replies, publishing, analytics, competitors, accounts):
    app.include_router(r.router, dependencies=[Depends(verify_tma)])


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}


# ── Telegram Mini App (полная панель) ────────────────────────────────────────
# Статика SPA отдаётся БЕЗ авторизации (браузер грузит её до того, как Telegram
# передаст initData в JS); защищены только /api/* выше.
_STATIC = Path(__file__).parent / "webapp" / "static"
app.mount("/app", StaticFiles(directory=str(_STATIC), html=True), name="webapp")


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/app/")
