"""reply_targets — свежая чужая виралка (<24ч, растущая) под реплаи (§9, §13)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ReplyTarget(Base):
    __tablename__ = "reply_targets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    external_id: Mapped[str] = mapped_column(String, unique=True)
    author: Mapped[str | None] = mapped_column(String)
    text: Mapped[str | None] = mapped_column(Text)
    views: Mapped[int | None] = mapped_column(BigInteger)
    xn_score: Mapped[float | None] = mapped_column(Numeric)
    velocity: Mapped[float | None] = mapped_column(Numeric)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String, default="new")  # new | replied | skipped
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
