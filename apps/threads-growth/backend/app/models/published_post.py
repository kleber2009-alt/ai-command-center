"""published_posts — наши опубликованные посты в Threads (§10, §13)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PublishedPost(Base):
    __tablename__ = "published_posts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    generated_content_id: Mapped[int | None] = mapped_column(BigInteger)
    account_id: Mapped[int | None] = mapped_column(BigInteger)
    threads_post_id: Mapped[str | None] = mapped_column(String)
    content: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(String)        # generated | reply
    url: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="published")
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
