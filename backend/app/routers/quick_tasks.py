"""Quick Tasks router — tareas puntuales sin proyecto."""
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.deps import DB, CurrentUser, LeaderOrAdmin
from app.models.quick_task import QuickTask
from app.models.user import User
from app.models.business import Business

router = APIRouter(prefix="/quick-tasks", tags=["Quick Tasks"])


class QuickTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    business_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    priority: str = "media"
    estimated_minutes: Optional[int] = None
    due_date: Optional[date] = None


class QuickTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    business_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    estimated_minutes: Optional[int] = None
    logged_minutes: Optional[int] = None
    due_date: Optional[date] = None
    is_done: Optional[bool] = None


def _task_dict(t: QuickTask) -> dict:
    return {
        "id": t.id,
        "user_id": t.user_id,
        "title": t.title,
        "description": t.description,
        "business_id": t.business_id,
        "business_name": t.business.name if t.business else None,
        "business_color": t.business.color if t.business else None,
        "assigned_to_id": t.assigned_to_id,
        "assigned_to_name": t.assigned_to.full_name if t.assigned_to else None,
        "creator_name": t.user.full_name if t.user else None,
        "status": t.status,
        "priority": t.priority,
        "estimated_minutes": t.estimated_minutes,
        "logged_minutes": t.logged_minutes,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "is_done": t.is_done,
        "done_at": t.done_at.isoformat() if t.done_at else None,
        "created_at": t.created_at.isoformat(),
    }


@router.get("/dashboard", response_model=dict)
async def quick_tasks_dashboard(
    db: DB = None,
    current_user: LeaderOrAdmin = None,
):
    """Leader/admin dashboard: tasks grouped by business with compliance metrics."""
    # All active tasks
    result = await db.execute(
        select(QuickTask)
        .options(selectinload(QuickTask.user), selectinload(QuickTask.assigned_to), selectinload(QuickTask.business))
        .where(QuickTask.is_done == False)
        .order_by(QuickTask.priority.desc(), QuickTask.due_date.asc().nulls_last())
    )
    all_tasks = result.scalars().all()

    # Businesses
    biz_result = await db.execute(select(Business).where(Business.is_active == True))
    businesses = biz_result.scalars().all()

    today = date.today()
    by_business = {}
    for biz in businesses:
        biz_tasks = [t for t in all_tasks if t.business_id == biz.id]
        overdue = [t for t in biz_tasks if t.due_date and t.due_date < today]
        urgent = [t for t in biz_tasks if t.priority == "urgente"]
        by_business[biz.id] = {
            "business_id": biz.id,
            "business_name": biz.name,
            "business_color": biz.color,
            "total": len(biz_tasks),
            "overdue": len(overdue),
            "urgent": len(urgent),
            "tasks": [_task_dict(t) for t in biz_tasks[:20]],  # top 20
        }

    no_biz = [t for t in all_tasks if not t.business_id]
    overdue_all = [t for t in all_tasks if t.due_date and t.due_date < today]
    urgent_all = [t for t in all_tasks if t.priority == "urgente"]

    return {
        "total_active": len(all_tasks),
        "total_overdue": len(overdue_all),
        "total_urgent": len(urgent_all),
        "by_business": list(by_business.values()),
        "no_business": [_task_dict(t) for t in no_biz[:10]],
    }


@router.get("", response_model=List[dict])
async def list_quick_tasks(
    business_id: Optional[int] = None,
    status: Optional[str] = None,
    include_done: bool = False,
    all_users: bool = False,   # leaders/admins can see all
    db: DB = None,
    current_user: CurrentUser = None,
):
    q = select(QuickTask).options(
        selectinload(QuickTask.user),
        selectinload(QuickTask.assigned_to),
        selectinload(QuickTask.business),
    )
    if not include_done:
        q = q.where(QuickTask.is_done == False)
    if business_id:
        q = q.where(QuickTask.business_id == business_id)
    if status:
        q = q.where(QuickTask.status == status)

    # all_users only for leaders/admins
    can_see_all = current_user.role in ("admin", "leader")
    if all_users and can_see_all:
        pass  # no user filter
    else:
        # show tasks assigned to me OR created by me
        q = q.where(
            (QuickTask.user_id == current_user.id) |
            (QuickTask.assigned_to_id == current_user.id)
        )

    q = q.order_by(
        QuickTask.is_done.asc(),
        QuickTask.priority.desc(),
        QuickTask.due_date.asc().nulls_last(),
        desc(QuickTask.created_at)
    )
    result = await db.execute(q)
    return [_task_dict(t) for t in result.scalars().all()]


@router.post("", response_model=dict)
async def create_quick_task(
    data: QuickTaskCreate,
    db: DB = None,
    current_user: CurrentUser = None,
):
    task = QuickTask(
        user_id=current_user.id,
        title=data.title,
        description=data.description,
        business_id=data.business_id,
        assigned_to_id=data.assigned_to_id,
        priority=data.priority,
        estimated_minutes=data.estimated_minutes,
        due_date=data.due_date,
        status="asignada" if data.assigned_to_id and data.assigned_to_id != current_user.id else "pendiente",
    )
    db.add(task)
    await db.flush()
    # reload with relationships
    result = await db.execute(
        select(QuickTask)
        .options(selectinload(QuickTask.user), selectinload(QuickTask.assigned_to), selectinload(QuickTask.business))
        .where(QuickTask.id == task.id)
    )
    task = result.scalar_one()
    await db.commit()
    return _task_dict(task)


@router.patch("/{task_id}", response_model=dict)
async def update_quick_task(
    task_id: int,
    data: QuickTaskUpdate,
    db: DB = None,
    current_user: CurrentUser = None,
):
    result = await db.execute(
        select(QuickTask)
        .options(selectinload(QuickTask.user), selectinload(QuickTask.assigned_to), selectinload(QuickTask.business))
        .where(QuickTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    # only creator or assignee or admin/leader can edit
    can_edit = task.user_id == current_user.id or task.assigned_to_id == current_user.id or current_user.role in ("admin", "leader")
    if not can_edit:
        raise HTTPException(status_code=403, detail="Sin permiso para editar esta tarea")

    for field, val in data.model_dump(exclude_none=True).items():
        setattr(task, field, val)
    if data.is_done:
        task.done_at = datetime.utcnow()
        task.status = "completada"
    task.updated_at = datetime.utcnow()
    await db.commit()
    return _task_dict(task)


@router.delete("/{task_id}", status_code=204)
async def delete_quick_task(
    task_id: int,
    db: DB = None,
    current_user: CurrentUser = None,
):
    task = await db.get(QuickTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if task.user_id != current_user.id and current_user.role not in ("admin", "leader"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    await db.delete(task)
    await db.commit()


@router.post("/{task_id}/log-time", response_model=dict)
async def log_time(
    task_id: int,
    minutes: int,
    db: DB = None,
    current_user: CurrentUser = None,
):
    result = await db.execute(
        select(QuickTask)
        .options(selectinload(QuickTask.user), selectinload(QuickTask.assigned_to), selectinload(QuickTask.business))
        .where(QuickTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    task.logged_minutes = (task.logged_minutes or 0) + minutes
    task.updated_at = datetime.utcnow()
    await db.commit()
    return _task_dict(task)
