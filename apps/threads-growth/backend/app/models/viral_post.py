"""viral_posts — скрейпленная чужая виралка со скорингом Xn + velocity (§5, §6, §13)."""
from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.config import settings
from app.core.database import Base


class ViralPost(Base):
    __tablename__ = "viral_posts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source: Mapped[str] = mapped_column(String)              # threads | twitter | reddit
    external_id: Mapped[str | None] = mapped_column(String, unique=True)
    author: Mapped[str | None] = mapped_column(String)
    author_url: Mapped[str | None] = mapped_column(String)
    text: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    likes: Mapped[int] = mapped_column(Integer, default=0)
    comments: Mapped[int] = mapped_column(Integer, default=0)
    reposts: Mapped[int] = mapped_column(Integer, default=0)
    views: Mapped[int] = mapped_column(BigInteger, default=0)
    author_followers: Mapped[int | None] = mapped_column(BigInteger)
    author_median_views: Mapped[float | None] = mapped_column(Numeric)

    xn_score: Mapped[float | None] = mapped_column(Numeric)   # views / author_median_views (§6)
    velocity: Mapped[float | None] = mapped_column(Numeric)   # Δengagement / hours_since_post
    rank: Mapped[float | None] = mapped_column(Numeric)       # композит для упорядочивания
    category: Mapped[str | None] = mapped_column(String)      # A | B | C | D

    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.embedding_dim))
    status: Mapped[str] = mapped_column(String, default="new")  # new | analyzed | adapted | skipped
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
