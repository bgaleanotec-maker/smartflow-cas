from datetime import datetime
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel
from app.models.incident import IncidentSeverity, IncidentStatus
from app.schemas.user import UserListResponse


class IncidentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    business_id: Optional[int] = None
    severity: IncidentSeverity = IncidentSeverity.MEDIUM
    responsible_id: Optional[int] = None
    has_economic_impact: bool = False
    economic_impact_amount: Optional[Decimal] = None
    economic_impact_description: Optional[str] = None
    affected_users_count: int = 0
    detection_date: Optional[datetime] = None
    related_project_id: Optional[int] = None
    tags: Optional[str] = None


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    business_id: Optional[int] = None
    severity: Optional[IncidentSeverity] = None
    status: Optional[IncidentStatus] = None
    responsible_id: Optional[int] = None
    has_economic_impact: Optional[bool] = None
    economic_impact_amount: Optional[Decimal] = None
    economic_impact_description: Optional[str] = None
    affected_users_count: Optional[int] = None
    root_cause: Optional[str] = None
    resolution_notes: Optional[str] = None
    resolution_date: Optional[datetime] = None
    related_project_id: Optional[int] = None
    tags: Optional[str] = None


class IncidentTimelineResponse(BaseModel):
    id: int
    action: str
    description: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    created_at: datetime
    user: Optional[UserListResponse] = None

    class Config:
        from_attributes = True


class IncidentResponse(BaseModel):
    id: int
    incident_number: str
    title: str
    description: Optional[str] = None
    severity: IncidentSeverity
    status: IncidentStatus
    has_economic_impact: bool
    economic_impact_amount: Optional[Decimal] = None
    economic_impact_description: Optional[str] = None
    affected_users_count: int
    root_cause: Optional[str] = None
    resolution_notes: Optional[str] = None
    detection_date: Optional[datetime] = None
    resolution_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    category_id: Optional[int] = None
    business_id: Optional[int] = None
    related_project_id: Optional[int] = None
    responsible: Optional[UserListResponse] = None
    reporter: Optional[UserListResponse] = None
    timeline: List[IncidentTimelineResponse] = []

    class Config:
        from_attributes = True
