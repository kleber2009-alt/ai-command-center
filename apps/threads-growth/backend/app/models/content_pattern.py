"""content_patterns — «обученная модель»: выигрышные паттерны с весами (§7, §12, §13).

weight растёт от паттернов, давших подписки, падает от провалов. reach_only ставится
паттернам, которые дают охват, но не подписки — их не усиливаем (§12).
"""
from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, Boolean, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.config import settings
from app.core.database import Base


class ContentPattern(Base):
    __tablename__ = "content_patterns"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    topic: Mapped[str | None] = mapped_column(String)
    hook_type: Mapped[str | None] = mapped_column(String)
    format: Mapped[str | None] = mapped_column(String)
    emotion: Mapped[str | None] = mapped_column(String)
    cta_type: Mapped[str | None] = mapped_column(String)
    structure_template: Mapped[str | None] = mapped_column(Text)   # абстрактный скелет, НЕ текст
    avg_views: Mapped[float | None] = mapped_column(Numeric)
    avg_followers_gained: Mapped[float | None] = mapped_column(Numeric)
    success_rate: Mapped[float | None] = mapped_column(Numeric)
    weight: Mapped[float] = mapped_column(Numeric, default=1.0)
    sample_count: Mapped[int] = mapped_column(Integer, default=0)
    reach_only: Mapped[bool] = mapped_column(Boolean, default=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.embedding_dim))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
