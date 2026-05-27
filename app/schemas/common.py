from pydantic import BaseModel
from typing import Any


class MessageResponse(BaseModel):
    message: str


class PaginatedResponse(BaseModel):
    total: int
    items: list[Any]
