"""SQLAlchemy async session + health check."""
from __future__ import annotations

import os
from typing import AsyncGenerator

try:
    from sqlalchemy.ext.asyncio import (
        AsyncSession, async_sessionmaker, create_async_engine,
    )
    from sqlalchemy import text
    HAS_SQLA = True
except ImportError:
    HAS_SQLA = False

DATABASE_URL = os.getenv(
    "POSTGRES_URL",
    "postgresql+asyncpg://aisales:CHANGEME@localhost:5432/aisales",
)

if HAS_SQLA:
    engine = create_async_engine(
        DATABASE_URL,
        echo=os.getenv("SQL_ECHO", "0") == "1",
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
    )
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
else:
    engine = None
    SessionLocal = None  # type: ignore


async def get_db() -> AsyncGenerator["AsyncSession", None]:
    """FastAPI dependency: async session."""
    if not HAS_SQLA or SessionLocal is None:
        raise RuntimeError("SQLAlchemy не установлен")
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def check_db() -> bool:
    """Health check для /ready."""
    if not HAS_SQLA or engine is None:
        return False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
