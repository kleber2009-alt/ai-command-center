"""generated_content — адаптации под стиль Ильи, очередь на апрув/публикацию (§8, §10, §13)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GeneratedContent(Base):
    __tablename__ = "generated_content"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source_post_id: Mapped[int | None] = mapped_column(BigInteger)
    account_id: Mapped[int | None] = mapped_column(BigInteger)
    content: Mapped[str | None] = mapped_column(Text)
    hook: Mapped[str | None] = mapped_column(String)
    topic: Mapped[str | None] = mapped_column(String)
    format: Mapped[str | None] = mapped_column(String)
    cta: Mapped[str | None] = mapped_column(String)
    ai_score: Mapped[float | None] = mapped_column(Numeric)
    similarity_score: Mapped[float | None] = mapped_column(Numeric)   # семантическая близость к источнику
    text_similarity: Mapped[float | None] = mapped_column(Numeric)    # лексическая близость
    # draft | approved | scheduled | published | failed | archived | rejected
    status: Mapped[str] = mapped_column(String, default="draft")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
