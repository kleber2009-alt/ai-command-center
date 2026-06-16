"""accounts — персоны-аккаунты Threads + состояние warmup-ramp (§11, §13)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    handle: Mapped[str] = mapped_column(String, nullable=False)
    threads_user_id: Mapped[str | None] = mapped_column(String)
    access_token: Mapped[str | None] = mapped_column(String)  # ШИФРОВАННЫЙ (core.security)
    niche_id: Mapped[int | None] = mapped_column(BigInteger)
    tone_of_voice: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="warmup")  # warmup | active | paused
    warmup_day: Mapped[int] = mapped_column(Integer, default=1)
    daily_post_cap: Mapped[int] = mapped_column(Integer, default=2)
    daily_reply_cap: Mapped[int] = mapped_column(Integer, default=5)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
