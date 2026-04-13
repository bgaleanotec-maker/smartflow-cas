from datetime import date, datetime
from typing import Optional, List, Any
from pydantic import BaseModel, field_validator
from app.models.epic import EpicStatus, StoryStatus, StoryUpdateType
from app.schemas.user import UserListResponse


def _parse_date(v):
    if not v or v == "": return None
    if isinstance(v, date): return v
    try: return date.fromisoformat(str(v))
    except: return None


class EpicCreate(BaseModel):
    title: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    status: EpicStatus = EpicStatus.backlog
    priority: str = "media"
    due_date: Optional[date] = None
    owner_id: Optional[int] = None

    @field_validator("due_date", mode="before")
    @classmethod
    def parse_due(cls, v): return _parse_date(v)

    @field_validator("owner_id", mode="before")
    @classmethod
    def parse_owner(cls, v): return int(v) if v and v != "" else None


class EpicUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[EpicStatus] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    owner_id: Optional[int] = None

    @field_validator("due_date", mode="before")
    @classmethod
    def parse_due(cls, v): return _parse_date(v)

    @field_validator("owner_id", mode="before")
    @classmethod
    def parse_owner(cls, v): return int(v) if v and v != "" else None


class EpicResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    status: EpicStatus
    priority: str
    due_date: Optional[date] = None
    owner: Optional[UserListResponse] = None
    stories: List["StoryResponse"] = []
    created_at: datetime
    class Config: from_attributes = True


class StoryCreate(BaseModel):
    title: str
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    epic_id: Optional[int] = None
    project_id: Optional[int] = None
    status: StoryStatus = StoryStatus.pendiente
    priority: str = "media"
    assigned_to_id: Optional[int] = None
    story_points: Optional[int] = None
    is_blocking: bool = False
    due_date: Optional[date] = None
    order: int = 0

    @field_validator("due_date", mode="before")
    @classmethod
    def parse_due(cls, v): return _parse_date(v)

    @field_validator("assigned_to_id", "story_points", mode="before")
    @classmethod
    def parse_int(cls, v): return int(v) if v and v != "" else None


class StoryUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    status: Optional[StoryStatus] = None
    priority: Optional[str] = None
    assigned_to_id: Optional[int] = None
    story_points: Optional[int] = None
    is_blocking: Optional[bool] = None
    due_date: Optional[date] = None
    order: Optional[int] = None

    @field_validator("due_date", mode="before")
    @classmethod
    def parse_due(cls, v): return _parse_date(v)

    @field_validator("assigned_to_id", "story_points", mode="before")
    @classmethod
    def parse_int(cls, v): return int(v) if v and v != "" else None


class StoryResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    epic_id: Optional[int] = None
    project_id: Optional[int] = None
    status: StoryStatus
    priority: str
    assigned_to: Optional[UserListResponse] = None
    story_points: Optional[int] = None
    is_blocking: bool
    due_date: Optional[date] = None
    order: int
    updates: List["StoryUpdateResponse"] = []
    created_at: datetime
    updated_at: datetime
    class Config: from_attributes = True


class StoryUpdateCreate(BaseModel):
    content: str
    update_type: StoryUpdateType = StoryUpdateType.novedad


class StoryUpdateResponse(BaseModel):
    id: int
    story_id: int
    content: str
    update_type: StoryUpdateType
    user: Optional[UserListResponse] = None
    created_at: datetime
    class Config: from_attributes = True
