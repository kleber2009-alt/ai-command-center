"""follower_snapshots — снимки подписчиков для дневной дельты (KPI, §12, §13)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FollowerSnapshot(Base):
    __tablename__ = "follower_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    account_id: Mapped[int | None] = mapped_column(BigInteger)
    follower_count: Mapped[int | None] = mapped_column(BigInteger)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
