"""Подключение к Postgres + pgvector через SQLAlchemy 2.0.

Все модели наследуют `Base`. Сессии берём через `get_session()` (FastAPI
dependency) или контекст-менеджер `session_scope()` (воркеры).
"""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


# Движок создаётся лениво: импорт моделей/сервисов не должен требовать живого
# драйвера БД (важно для воркеров без БД и для selftest-ов чистой логики).
@lru_cache
def get_engine() -> Engine:
    return create_engine(settings.database_url, pool_pre_ping=True, future=True)


SessionLocal = sessionmaker(autoflush=False, expire_on_commit=False, future=True)


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    db = SessionLocal(bind=get_engine())
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Транзакционный контекст для воркеров: commit при успехе, rollback при ошибке."""
    db = SessionLocal(bind=get_engine())
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
