from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class BusinessCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#6366f1"


class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None


class BusinessResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    color: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
