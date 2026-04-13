from datetime import date, datetime
from typing import Optional, List, Any
from pydantic import BaseModel, field_validator
from app.models.project import ProjectStatus
from app.schemas.user import UserListResponse


def _parse_date(v: Any) -> Optional[date]:
    """Accept date objects, ISO strings, or empty string (→ None)."""
    if v is None or v == "":
        return None
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        try:
            return date.fromisoformat(v)
        except ValueError:
            return None
    return None


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    business_id: Optional[int] = None
    leader_id: Optional[int] = None
    priority_id: Optional[int] = None
    status: ProjectStatus = ProjectStatus.PLANNING
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    is_private: bool = False
    color: str = "#6366f1"
    tags: Optional[str] = None
    member_ids: Optional[List[int]] = []

    @field_validator("start_date", "due_date", mode="before")
    @classmethod
    def parse_dates(cls, v: Any) -> Optional[date]:
        return _parse_date(v)

    @field_validator("color", mode="before")
    @classmethod
    def default_color(cls, v: Any) -> str:
        if not v:
            return "#6366f1"
        return v


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    business_id: Optional[int] = None
    leader_id: Optional[int] = None
    priority_id: Optional[int] = None
    status: Optional[ProjectStatus] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    progress: Optional[int] = None
    is_private: Optional[bool] = None
    color: Optional[str] = None
    tags: Optional[str] = None
    member_ids: Optional[List[int]] = None

    @field_validator("start_date", "due_date", mode="before")
    @classmethod
    def parse_dates(cls, v: Any) -> Optional[date]:
        return _parse_date(v)


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    status: ProjectStatus
    priority_id: Optional[int] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    progress: int
    is_private: bool
    color: str
    tags: Optional[str] = None
    created_at: datetime
    leader: Optional[UserListResponse] = None
    members: List[UserListResponse] = []
    task_count: Optional[int] = 0
    completed_task_count: Optional[int] = 0

    class Config:
        from_attributes = True
