from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SessionCreate(BaseModel):
    name: str
    note: Optional[str] = None


class SessionOut(BaseModel):
    id: UUID
    name: str
    note: Optional[str] = None
    status: str
    created_at: datetime
    closed_at: Optional[datetime] = None
    doc_count: int = 0
    done_count: int = 0
    order_count: int = 0

    class Config:
        from_attributes = True
