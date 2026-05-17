from sqlalchemy import Column, String, Integer, DateTime, Enum, ARRAY, Text, BigInteger, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base


class FunnelStage(str, enum.Enum):
    hello = "hello"
    discovery = "discovery"
    pitch = "pitch"
    objections = "objections"
    close = "close"
    followup = "followup"
    closed_won = "closed_won"
    closed_lost = "closed_lost"


class ClientSegment(str, enum.Enum):
    segment_a = "segment_a"
    segment_b = "segment_b"
    segment_c = "segment_c"
    unknown = "unknown"


class Client(Base):
    __tablename__ = "clients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ig_username = Column(String(255))
    ig_user_id = Column(String(100), index=True)
    tg_username = Column(String(255))
    tg_user_id = Column(BigInteger, index=True)
    phone = Column(String(50))
    email = Column(String(255))
    display_name = Column(String(255))
    segment = Column(Enum(ClientSegment, name="client_segment"), default=ClientSegment.unknown)
    funnel_stage = Column(Enum(FunnelStage, name="funnel_stage"), default=FunnelStage.hello)
    qual_score = Column(Integer, default=0)
    predicted_deal_amount = Column(Numeric(10, 2))
    source = Column(String(100))
    tags = Column(ARRAY(String), default=list)
    notes = Column(Text)
    metadata_json = Column("metadata", JSONB, default=dict)
    consent_given_at = Column(DateTime(timezone=True))
    first_contact_at = Column(DateTime(timezone=True))
    last_contact_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
