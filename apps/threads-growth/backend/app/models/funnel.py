"""Воронка Threads → Telegram (скилл threads-telegram-funnel): ветки, приёмники,
банк историй, комментарии, вступления в канал, состояние.

Ветка хранится как «тело + очередь хуков»: posts — посты 2..N (тело, переиспользуется
в перевыпусках), hooks — 6 вариантов поста 1, active_hook — какой выходит сейчас.
Ссылка в канал в текстах — плейсхолдер {link}; реальная подставляется при показе и
публикации (своя ссылка-приглашение под каждую ветку или пост-приёмник).
"""
from __future__ import annotations

from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.config import settings
from app.core.database import Base


class FunnelThread(Base):
    """Одна ветка в одном слоте. Перевыпуск — новая строка с parent_id на первый выпуск."""

    __tablename__ = "funnel_threads"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    account_id: Mapped[int | None] = mapped_column(BigInteger)
    plan_date: Mapped[date] = mapped_column(Date, index=True)
    slot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    cluster: Mapped[int] = mapped_column(Integer)                 # 1–6 (§3)
    template: Mapped[str] = mapped_column(String(1))              # A–D (§5)
    topic: Mapped[str | None] = mapped_column(Text)
    hypothesis: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String, default="new")      # new | reissue
    parent_id: Mapped[int | None] = mapped_column(BigInteger, index=True)  # первый выпуск тела
    reissue_no: Mapped[int] = mapped_column(Integer, default=0)

    # [{"text": str, "mechanic": str, "needs_proof": bool}] — 6 хуков (§4.5)
    hooks: Mapped[list] = mapped_column(JSONB, default=list)
    active_hook: Mapped[int] = mapped_column(Integer, default=0)
    posts: Mapped[list] = mapped_column(JSONB, default=list)      # тело: посты 2..N с {link}
    mid_index: Mapped[int | None] = mapped_column(Integer)        # номер поста (1..N) с мид-роллом

    receiver_id: Mapped[int | None] = mapped_column(BigInteger)
    receiver_brief: Mapped[str | None] = mapped_column(Text)      # что должно быть в приёмнике
    link_url: Mapped[str | None] = mapped_column(String)          # подставляется вместо {link}
    invite_link: Mapped[str | None] = mapped_column(String, index=True)  # закрытый канал: своя на ветку

    materials_request: Mapped[str | None] = mapped_column(Text)   # что нужно от автора
    materials: Mapped[list] = mapped_column(JSONB, default=list)  # [{"type": "photo", "file_id": str}]
    materials_fallback: Mapped[bool] = mapped_column(Boolean, default=False)
    facts_needed: Mapped[list] = mapped_column(JSONB, default=list)  # вопросы автору про цифры
    qa: Mapped[dict] = mapped_column(JSONB, default=dict)         # {"passed": bool, "checks": [...]}

    # planned | generating | draft | approved | publishing | published | handed
    # | reserve | replaced | skipped | failed
    status: Mapped[str] = mapped_column(String, default="planned", index=True)
    verdict: Mapped[str | None] = mapped_column(String)           # winner | below | neutral
    archived_until: Mapped[date | None] = mapped_column(Date)     # тело в архиве до (только у первого выпуска)
    version: Mapped[int] = mapped_column(Integer, default=0)      # версия карточки
    card_chat_id: Mapped[int | None] = mapped_column(BigInteger)
    card_message_ids: Mapped[list] = mapped_column(JSONB, default=list)

    threads_media_ids: Mapped[list] = mapped_column(JSONB, default=list)  # id постов цепочки
    permalink: Mapped[str | None] = mapped_column(String)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replies_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    metrics_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class FunnelReceiver(Base):
    """Пост-приёмник в канале (§11): на него ведёт ссылка из ветки."""

    __tablename__ = "funnel_receivers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    url: Mapped[str | None] = mapped_column(String)               # t.me/канал/N (пусто у черновика)
    channel_message_id: Mapped[int | None] = mapped_column(BigInteger)
    title: Mapped[str] = mapped_column(String)
    contents: Mapped[str | None] = mapped_column(Text)            # что внутри
    kind: Mapped[str | None] = mapped_column(String)              # prompts | instruction | assistant | other
    clusters: Mapped[list] = mapped_column(JSONB, default=list)   # [] = подходит любому кластеру
    text: Mapped[str | None] = mapped_column(Text)                # текст поста (черновики агента)
    status: Mapped[str] = mapped_column(String, default="active")  # draft | active | archived | rejected
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    joins: Mapped[int] = mapped_column(Integer, default=0)
    for_thread_id: Mapped[int | None] = mapped_column(BigInteger)  # черновик написан под эту ветку
    card_message_ids: Mapped[list] = mapped_column(JSONB, default=list)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.embedding_dim))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StoryFact(Base):
    """Банк историй и фактов: личные цифры агент берёт только отсюда."""

    __tablename__ = "funnel_story_bank"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(String, default="fact")     # fact | story
    text: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String, default="manual")  # seed | story | voice | card | manual
    verified: Mapped[bool] = mapped_column(Boolean, default=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.embedding_dim))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FunnelComment(Base):
    """Комментарий под нашей веткой + черновик ответа на апрув (решение 6)."""

    __tablename__ = "funnel_comments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    thread_id: Mapped[int] = mapped_column(BigInteger, index=True)
    comment_id: Mapped[str] = mapped_column(String, unique=True)  # media id комментария в Threads
    author: Mapped[str | None] = mapped_column(String)
    text: Mapped[str | None] = mapped_column(Text)
    draft: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="draft")  # draft | published | skipped | failed
    card_message_id: Mapped[int | None] = mapped_column(BigInteger)
    reply_media_id: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ChannelJoin(Base):
    """Вступление в канал по ссылке-приглашению ветки (закрытый канал)."""

    __tablename__ = "funnel_channel_joins"
    __table_args__ = (UniqueConstraint("invite_link", "tg_user_id", name="uq_funnel_join"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    invite_link: Mapped[str] = mapped_column(String, index=True)
    thread_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    tg_user_id: Mapped[int] = mapped_column(BigInteger)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FunnelState(Base):
    """Ключ-значение: веса кластеров, дата обновления токена, отчёты."""

    __tablename__ = "funnel_state"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
