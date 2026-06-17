"""post_analytics — тайм-серия инсайтов опубликованного (§12, §13).

Снимки в T+1ч/+3ч/+6ч/+24ч/+72ч/+7д. follow_conversion_rate — ключевой сигнал
для петли обучения: отличает «дало охват» от «дало подписки» (reach-only).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PostAnalytics(Base):
    __tablename__ = "post_analytics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    published_post_id: Mapped[int | None] = mapped_column(BigInteger)
    views: Mapped[int] = mapped_column(BigInteger, default=0)
    likes: Mapped[int] = mapped_column(Integer, default=0)
    comments: Mapped[int] = mapped_column(Integer, default=0)
    reposts: Mapped[int] = mapped_column(Integer, default=0)
    quotes: Mapped[int] = mapped_column(Integer, default=0)
    profile_visits: Mapped[int] = mapped_column(Integer, default=0)
    followers_gained: Mapped[int] = mapped_column(Integer, default=0)
    engagement_rate: Mapped[float | None] = mapped_column(Numeric)
    follow_conversion_rate: Mapped[float | None] = mapped_column(Numeric)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
