from typing import Optional, List
from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, update as sa_update
from app.core.deps import DB, CurrentUser, LeaderOrAdmin
from app.models.project import Sprint
from app.models.task import Task
from app.models.catalog import TaskStatus

router = APIRouter(prefix="/sprints", tags=["Sprints"])


class SprintCreate(BaseModel):
    name: str
    project_id: int
    goal: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class SprintUpdate(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None
    is_completed: Optional[bool] = None


class SprintResponse(BaseModel):
    id: int
    name: str
    goal: Optional[str] = None
    project_id: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool
    is_completed: bool
    task_count: int = 0
    completed_task_count: int = 0

    class Config:
        from_attributes = True


async def _sprint_with_counts(db, sprint: Sprint) -> dict:
    total = await db.execute(
        select(func.count(Task.id)).where(Task.sprint_id == sprint.id, Task.is_deleted == False)
    )
    done_statuses = await db.execute(
        select(TaskStatus.id).where(TaskStatus.is_done_state == True)
    )
    done_ids = [r[0] for r in done_statuses.fetchall()]
    completed = 0
    if done_ids:
        comp_r = await db.execute(
            select(func.count(Task.id)).where(
                Task.sprint_id == sprint.id,
                Task.is_deleted == False,
                Task.status_id.in_(done_ids)
            )
        )
        completed = comp_r.scalar() or 0
    return {
        "id": sprint.id, "name": sprint.name, "goal": sprint.goal,
        "project_id": sprint.project_id, "start_date": sprint.start_date,
        "end_date": sprint.end_date, "is_active": sprint.is_active,
        "is_completed": sprint.is_completed,
        "task_count": total.scalar() or 0,
        "completed_task_count": completed,
    }


@router.get("", response_model=List[SprintResponse])
async def list_sprints(db: DB, current_user: CurrentUser, project_id: Optional[int] = None):
    query = select(Sprint)
    if project_id:
        query = query.where(Sprint.project_id == project_id)
    result = await db.execute(query.order_by(Sprint.created_at.desc()))
    sprints = result.scalars().all()
    return [await _sprint_with_counts(db, s) for s in sprints]


@router.post("", response_model=SprintResponse, status_code=201)
async def create_sprint(payload: SprintCreate, db: DB, current_user: LeaderOrAdmin):
    sprint = Sprint(**payload.model_dump())
    db.add(sprint)
    await db.flush()
    await db.refresh(sprint)
    return await _sprint_with_counts(db, sprint)


@router.patch("/{sprint_id}", response_model=SprintResponse)
async def update_sprint(sprint_id: int, payload: SprintUpdate, db: DB, current_user: LeaderOrAdmin):
    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint no encontrado")

    # If activating, deactivate others in same project
    update_data = payload.model_dump(exclude_unset=True)
    if update_data.get("is_active"):
        await db.execute(
            sa_update(Sprint).where(
                Sprint.project_id == sprint.project_id,
                Sprint.id != sprint_id
            ).values(is_active=False)
        )

    for field, value in update_data.items():
        setattr(sprint, field, value)
    await db.flush()
    return await _sprint_with_counts(db, sprint)


@router.delete("/{sprint_id}", status_code=204)
async def delete_sprint(sprint_id: int, db: DB, current_user: LeaderOrAdmin):
    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint no encontrado")
    await db.execute(
        sa_update(Task).where(Task.sprint_id == sprint_id).values(sprint_id=None)
    )
    await db.delete(sprint)
    await db.flush()
