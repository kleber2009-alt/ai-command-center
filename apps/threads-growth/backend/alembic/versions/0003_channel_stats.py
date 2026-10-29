"""channel_stats — цифры постов каналов автора и сила материалов-приёмников.

Revision ID: 0003_channel_stats
Revises: 0002_funnel
Create Date: 2026-10-29
"""
from __future__ import annotations

from alembic import op

from app.models.funnel import ChannelPostStat

revision = "0003_channel_stats"
down_revision = "0002_funnel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    ChannelPostStat.__table__.create(bind, checkfirst=True)
    op.execute("alter table funnel_receivers add column if not exists score double precision")
    op.execute("alter table funnel_receivers add column if not exists stats jsonb not null default '{}'::jsonb")
    op.execute("alter table funnel_receivers add column if not exists source varchar")
    op.execute("update funnel_receivers set source = 'catalog' where source is null and url like 'https://t.me/%'")


def downgrade() -> None:
    op.execute("alter table funnel_receivers drop column if exists source")
    op.execute("alter table funnel_receivers drop column if exists stats")
    op.execute("alter table funnel_receivers drop column if exists score")
    op.drop_table("funnel_channel_posts")
