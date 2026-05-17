"""SQLAlchemy models · matches schema in 04-database/001_initial_schema.sql + 003_analytics_schema.sql."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

try:
    from sqlalchemy import (
        BigInteger, Boolean, Column, DateTime, ForeignKey,
        Integer, Numeric, String, Text, func,
    )
    from sqlalchemy.dialects.postgresql import JSONB, UUID
    from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
    HAS_SQLA = True
except ImportError:
    HAS_SQLA = False
    DeclarativeBase = object  # type: ignore


if HAS_SQLA:
    class Base(DeclarativeBase):
        pass


    class User(Base):
        __tablename__ = "users"
        id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
        password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
        name: Mapped[str] = mapped_column(String(255), nullable=False)
        role: Mapped[str] = mapped_column(String(20), default="user")
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


    class Client(Base):
        __tablename__ = "clients"
        id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        channel: Mapped[str] = mapped_column(String(10), nullable=False)  # ig | tg
        handle: Mapped[str] = mapped_column(String(255))
        name: Mapped[Optional[str]] = mapped_column(String(255))
        stage: Mapped[str] = mapped_column(String(20), default="hello")
        segment: Mapped[str] = mapped_column(String(10), default="unknown")
        score: Mapped[int] = mapped_column(Integer, default=0)
        icp_match: Mapped[int] = mapped_column(Integer, default=0)
        first_contact: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
        last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


    class Conversation(Base):
        __tablename__ = "conversations"
        id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
        channel: Mapped[str] = mapped_column(String(10))
        is_paused: Mapped[bool] = mapped_column(Boolean, default=False)
        paused_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


    class Message(Base):
        __tablename__ = "messages"
        id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
        conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
        direction: Mapped[str] = mapped_column(String(10))  # in | out
        author: Mapped[str] = mapped_column(String(20))  # client | agent | user
        content_type: Mapped[str] = mapped_column(String(20), default="text")
        content: Mapped[str] = mapped_column(Text)
        meta: Mapped[Optional[dict]] = mapped_column(JSONB)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


    class AgentAction(Base):
        __tablename__ = "agent_actions"
        id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
        conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
        client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
        agent_type: Mapped[str] = mapped_column(String(20))
        detected_intent: Mapped[Optional[str]] = mapped_column(String(50))
        current_stage: Mapped[str] = mapped_column(String(20))
        next_stage: Mapped[Optional[str]] = mapped_column(String(20))
        segment: Mapped[str] = mapped_column(String(10), default="unknown")
        icp_match: Mapped[Optional[int]] = mapped_column(Integer)
        action: Mapped[str] = mapped_column(String(20))
        response_text: Mapped[Optional[str]] = mapped_column(Text)
        rag_used: Mapped[bool] = mapped_column(Boolean, default=False)
        rag_chunks: Mapped[Optional[dict]] = mapped_column(JSONB)
        rag_miss: Mapped[bool] = mapped_column(Boolean, default=False)
        rag_miss_topic: Mapped[Optional[str]] = mapped_column(Text)
        model_used: Mapped[Optional[str]] = mapped_column(String(50))
        tokens_used: Mapped[Optional[int]] = mapped_column(Integer)
        latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
        cost_usd: Mapped[Optional[float]] = mapped_column(Numeric(10, 6))
        errors: Mapped[Optional[dict]] = mapped_column(JSONB)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


    class Escalation(Base):
        __tablename__ = "escalations"
        id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
        client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
        reason: Mapped[str] = mapped_column(String(30))
        urgency: Mapped[str] = mapped_column(String(10))
        summary: Mapped[str] = mapped_column(Text)
        suggested_response: Mapped[Optional[str]] = mapped_column(Text)
        status: Mapped[str] = mapped_column(String(20), default="pending")
        assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"))
        resolved_by: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"))
        resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


    class KnowledgeGap(Base):
        __tablename__ = "knowledge_gaps"
        id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        topic: Mapped[str] = mapped_column(Text, unique=True)
        target_collection: Mapped[Optional[str]] = mapped_column(String(50))
        severity: Mapped[str] = mapped_column(String(10), default="low")
        miss_count: Mapped[int] = mapped_column(Integer, default=1)
        last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
        example_query: Mapped[Optional[str]] = mapped_column(Text)
        status: Mapped[str] = mapped_column(String(20), default="open")
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
        updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
