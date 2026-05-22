"""
AI Sales · FastAPI entry point.

Запускает:
- API endpoints для дашборда (clients, conversations, agents, kb)
- Webhook handlers для IG и TG
- Health check + metrics
- Подключение к Postgres, Redis, Qdrant, MinIO

Локальный запуск:
    uvicorn main:app --reload --port 8000

В Docker:
    docker compose up api

В production (на сервере):
    docker compose up -d api
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

# ============ Logging ============
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s · %(name)s · %(levelname)s · %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("aisales")


# ============ App lifecycle ============

@asynccontextmanager
async def lifespan(app: "FastAPI") -> AsyncGenerator[None, None]:
    """Startup + shutdown."""
    log.info("🚀 AI Sales API starting up...")

    # Проверка env
    required = ["ANTHROPIC_API_KEY"]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        log.warning("⚠ Не установлены: %s. Агенты будут в mock-режиме.", missing)
        os.environ.setdefault("AISALES_MOCK", "1")

    # Health подключений
    await _check_connections()

    # Загрузка промптов
    try:
        from agents.prompts_loader import load_prompt, check_placeholders
        for agent in ["ig", "tg", "analyst", "rop"]:
            try:
                prompt = load_prompt(agent)  # type: ignore
                placeholders = check_placeholders(prompt)
                if placeholders:
                    log.warning("⚠ %s prompt has %d placeholders to fill", agent.upper(), len(placeholders))
                else:
                    log.info("✓ %s prompt ready", agent.upper())
            except Exception as e:
                log.error("✕ %s prompt load failed: %s", agent.upper(), e)
    except Exception as e:
        log.warning("Prompts loader unavailable: %s", e)

    log.info("✓ AI Sales API ready · http://0.0.0.0:8000")
    log.info("  Docs: http://0.0.0.0:8000/docs")
    log.info("  Mock mode: %s", os.getenv("AISALES_MOCK", "0") == "1")

    yield

    log.info("🛑 AI Sales API shutting down...")


async def _check_connections() -> None:
    """Quick health check всех подключений."""
    services = {
        "POSTGRES_URL": "Postgres",
        "REDIS_URL": "Redis",
        "QDRANT_URL": "Qdrant",
        "MINIO_ENDPOINT": "MinIO",
    }
    for env, name in services.items():
        val = os.getenv(env)
        if val:
            log.info("  · %s: configured (%s)", name, val.split("@")[-1][:40] if "@" in val else val[:40])
        else:
            log.warning("  · %s: NOT configured", name)


# ============ App ============

if not HAS_FASTAPI:
    raise RuntimeError("Установи зависимости: pip install -r requirements.txt")

app = FastAPI(
    title="AI Sales API",
    version="0.1.0",
    description="Multi-agent sales system for Instagram + Telegram",
    lifespan=lifespan,
)

# CORS — для дашборда на Netlify
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Middleware: request timing + logging ============

@app.middleware("http")
async def request_logger(request: Request, call_next):
    t0 = time.time()
    response = await call_next(request)
    duration_ms = int((time.time() - t0) * 1000)
    response.headers["X-Process-Time-Ms"] = str(duration_ms)
    log.info(
        "%s %s · %d · %dms",
        request.method, request.url.path, response.status_code, duration_ms
    )
    return response


# ============ Routes ============

@app.get("/")
async def root():
    return {
        "service": "ai-sales",
        "version": "0.1.0",
        "status": "ok",
        "mock_mode": os.getenv("AISALES_MOCK", "0") == "1",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health():
    """K8s-style health check."""
    return {"status": "healthy", "timestamp": time.time()}


@app.get("/ready")
async def ready():
    """Readiness probe — проверяет что все зависимости подключены."""
    checks: dict[str, str] = {}
    # Anthropic
    checks["anthropic"] = "configured" if os.getenv("ANTHROPIC_API_KEY") else "missing"
    # Postgres
    if os.getenv("POSTGRES_URL"):
        try:
            from db.session import check_db
            checks["postgres"] = "ok" if await check_db() else "fail"
        except Exception:
            checks["postgres"] = "skipped"
    else:
        checks["postgres"] = "missing"
    # Все либо ok/configured/skipped, либо fail
    overall = "ready" if all(v in ("ok", "configured", "skipped") for v in checks.values()) else "degraded"
    return {"status": overall, "checks": checks}


# Webhooks
try:
    from webhooks.instagram import router as ig_router
    if ig_router:
        app.include_router(ig_router)
        log.info("✓ Instagram webhook router loaded")
except ImportError as e:
    log.warning("Instagram router not loaded: %s", e)

try:
    from webhooks.telegram import router as tg_router
    if tg_router:
        app.include_router(tg_router)
        log.info("✓ Telegram webhook router loaded")
except ImportError as e:
    log.warning("Telegram router not loaded: %s", e)

# REST API
try:
    from api.clients import router as clients_router
    app.include_router(clients_router)
    log.info("✓ Clients API loaded")
except ImportError as e:
    log.warning("Clients API not loaded: %s", e)

try:
    from api.agents import router as agents_router
    app.include_router(agents_router)
    log.info("✓ Agents API loaded")
except ImportError as e:
    log.warning("Agents API not loaded: %s", e)


# ============ Exception handler ============

@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    log.exception("Unhandled: %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "path": request.url.path},
    )


# ============ CLI ============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("ENV", "dev") == "dev",
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
