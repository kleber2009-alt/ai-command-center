"""funnel — воронка Threads → Telegram: ветки, приёмники, банк историй, комментарии,
вступления в канал, состояние.

Таблицы создаются из моделей app.models.funnel (checkfirst): на чистой БД их уже
создала 0001 (она строит всё Base.metadata), на существующей — создаёт эта миграция.

Revision ID: 0002_funnel
Revises: 0001_initial
Create Date: 2026-10-28
"""
from __future__ import annotations

from alembic import op

from app.models.funnel import (
    ChannelJoin,
    FunnelComment,
    FunnelReceiver,
    FunnelState,
    FunnelThread,
    StoryFact,
)

revision = "0002_funnel"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

_TABLES = [
    FunnelThread.__table__,
    FunnelReceiver.__table__,
    StoryFact.__table__,
    FunnelComment.__table__,
    ChannelJoin.__table__,
    FunnelState.__table__,
]

_INDEXES = [
    "create index if not exists idx_funnel_threads_status_slot on funnel_threads (status, slot_at)",
    "create index if not exists idx_funnel_threads_published on funnel_threads (published_at desc nulls last)",
    "create index if not exists idx_funnel_receivers_status on funnel_receivers (status)",
]


def upgrade() -> None:
    bind = op.get_bind()
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    for table in _TABLES:
        table.create(bind=bind, checkfirst=True)
    for ddl in _INDEXES:
        op.execute(ddl)


def downgrade() -> None:
    bind = op.get_bind()
    for table in reversed(_TABLES):
        table.drop(bind=bind, checkfirst=True)
