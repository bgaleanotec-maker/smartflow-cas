from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel
from app.schemas.user import UserListResponse


class StatusInfo(BaseModel):
    id: int
    name: str
    color: str
    is_done_state: bool = False
    class Config:
        from_attributes = True


class PriorityInfo(BaseModel):
    id: int
    name: str
    color: str
    class Config:
        from_attributes = True


class SubTaskCreate(BaseModel):
    title: str
    assignee_id: Optional[int] = None
    order_index: int = 0


class SubTaskResponse(BaseModel):
    id: int
    title: str
    is_completed: bool
    order_index: int
    assignee: Optional[UserListResponse] = None

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    epic_id: Optional[int] = None
    sprint_id: Optional[int] = None
    assignee_id: Optional[int] = None
    status_id: Optional[int] = None
    priority_id: Optional[int] = None
    story_points: Optional[int] = None
    estimated_hours: float = 0.0
    due_date: Optional[date] = None
    labels: Optional[str] = None
    watcher_ids: Optional[List[int]] = []


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    epic_id: Optional[int] = None
    sprint_id: Optional[int] = None
    assignee_id: Optional[int] = None
    status_id: Optional[int] = None
    priority_id: Optional[int] = None
    story_points: Optional[int] = None
    estimated_hours: Optional[float] = None
    due_date: Optional[date] = None
    order_index: Optional[int] = None
    labels: Optional[str] = None


class TaskResponse(BaseModel):
    id: int
    task_number: str
    title: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    epic_id: Optional[int] = None
    sprint_id: Optional[int] = None
    story_points: Optional[int] = None
    estimated_hours: float
    logged_hours: float
    due_date: Optional[date] = None
    order_index: int
    labels: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    assignee: Optional[UserListResponse] = None
    reporter: Optional[UserListResponse] = None
    subtasks: List[SubTaskResponse] = []
    status_id: Optional[int] = None
    priority_id: Optional[int] = None
    status: Optional[StatusInfo] = None
    priority: Optional[PriorityInfo] = None
    watchers: List[UserListResponse] = []
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
