from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.models.client import FunnelStage, ClientSegment


class ClientBase(BaseModel):
    ig_username: Optional[str] = None
    tg_username: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    display_name: Optional[str] = None
    segment: ClientSegment = ClientSegment.unknown
    funnel_stage: FunnelStage = FunnelStage.hello
    qual_score: int = Field(default=0, ge=0, le=100)
    source: Optional[str] = None
    tags: list[str] = []
    notes: Optional[str] = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    display_name: Optional[str] = None
    segment: Optional[ClientSegment] = None
    funnel_stage: Optional[FunnelStage] = None
    qual_score: Optional[int] = None
    tags: Optional[list[str]] = None
    notes: Optional[str] = None


class ClientOut(ClientBase):
    id: UUID
    predicted_deal_amount: Optional[Decimal] = None
    first_contact_at: Optional[datetime] = None
    last_contact_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
