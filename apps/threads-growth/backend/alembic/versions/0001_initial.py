"""initial schema — pgvector extension + все таблицы (§13)

Создаёт расширение vector, затем все таблицы из Base.metadata (источник правды —
SQLAlchemy-модели, чтобы миграция не расходилась со схемой) и ключевые индексы.

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-16
"""
from __future__ import annotations

from alembic import op

from app.core.database import Base
import app.models  # noqa: F401 — регистрирует таблицы

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


_INDEXES = [
    "create index if not exists idx_viral_rank on viral_posts (rank desc nulls last)",
    "create index if not exists idx_viral_xn on viral_posts (xn_score desc nulls last)",
    "create index if not exists idx_viral_status on viral_posts (status)",
    "create index if not exists idx_viral_published on viral_posts (published_at desc)",
    "create index if not exists idx_content_status on generated_content (status)",
    "create index if not exists idx_reply_targets_status on reply_targets (status)",
    "create index if not exists idx_reply_targets_xn on reply_targets (xn_score desc nulls last)",
    "create index if not exists idx_patterns_weight on content_patterns (weight desc)",
    "create index if not exists idx_insights_post on post_analytics (published_post_id, collected_at)",
    "create index if not exists idx_follower_snap on follower_snapshots (account_id, captured_at)",
]


def upgrade() -> None:
    bind = op.get_bind()
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.create_all(bind=bind)
    for ddl in _INDEXES:
        op.execute(ddl)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
