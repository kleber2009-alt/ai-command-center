"""replies — опубликованные нами реплаи (§9, §13)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Reply(Base):
    __tablename__ = "replies"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    target_id: Mapped[int | None] = mapped_column(BigInteger)
    account_id: Mapped[int | None] = mapped_column(BigInteger)
    threads_media_id: Mapped[str | None] = mapped_column(String)
    text: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="draft")  # draft | approved | published | failed
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
