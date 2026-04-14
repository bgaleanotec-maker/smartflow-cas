from typing import Optional, List
from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.deps import DB, CurrentUser
from app.models.task import Task, SubTask
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate, TaskResponse, SubTaskCreate, SubTaskResponse

router = APIRouter(prefix="/tasks", tags=["Tareas"])


async def _get_next_task_number(db: DB, project_id: Optional[int] = None) -> str:
    from sqlalchemy import func as sqlfunc
    result = await db.execute(select(sqlfunc.count(Task.id)))
    count = result.scalar() or 0
    return f"TSK-{str(count + 1).zfill(4)}"


@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    db: DB,
    current_user: CurrentUser,
    project_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    assignee_id: Optional[int] = None,
    status_id: Optional[int] = None,
    priority_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=500),
):
    query = (
        select(Task)
        .options(
            selectinload(Task.assignee).selectinload(User.main_business),
            selectinload(Task.reporter).selectinload(User.main_business),
            selectinload(Task.subtasks),
            selectinload(Task.status),
            selectinload(Task.priority),
            selectinload(Task.watchers).selectinload(User.main_business),
        )
        .where(Task.is_deleted == False)
        .order_by(Task.order_index)
        .offset(skip)
        .limit(limit)
    )

    if project_id:
        query = query.where(Task.project_id == project_id)
    if sprint_id:
        query = query.where(Task.sprint_id == sprint_id)
    if assignee_id:
        query = query.where(Task.assignee_id == assignee_id)
    if status_id:
        query = query.where(Task.status_id == status_id)
    if priority_id:
        query = query.where(Task.priority_id == priority_id)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, db: DB, current_user: CurrentUser):
    task_number = await _get_next_task_number(db, payload.project_id)

    task = Task(
        task_number=task_number,
        title=payload.title,
        description=payload.description,
        project_id=payload.project_id,
        epic_id=payload.epic_id,
        sprint_id=payload.sprint_id,
        assignee_id=payload.assignee_id,
        reporter_id=current_user.id,
        status_id=payload.status_id,
        priority_id=payload.priority_id,
        story_points=payload.story_points,
        estimated_hours=payload.estimated_hours,
        due_date=payload.due_date,
        labels=payload.labels,
    )
    db.add(task)
    await db.flush()
    # Reload with eager-loaded relationships to avoid async lazy-load error
    result2 = await db.execute(
        select(Task)
        .options(
            selectinload(Task.assignee).selectinload(User.main_business),
            selectinload(Task.reporter).selectinload(User.main_business),
            selectinload(Task.subtasks),
            selectinload(Task.status),
            selectinload(Task.priority),
            selectinload(Task.watchers).selectinload(User.main_business),
        )
        .where(Task.id == task.id)
    )
    task = result2.scalar_one()
    return task


@router.get("/my", response_model=List[TaskResponse])
async def get_my_tasks(
    db: DB,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
):
    query = (
        select(Task)
        .options(selectinload(Task.assignee).selectinload(User.main_business), selectinload(Task.subtasks))
        .where(Task.assignee_id == current_user.id, Task.is_deleted == False)
        .order_by(Task.due_date.asc().nullslast())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.assignee).selectinload(User.main_business),
            selectinload(Task.reporter).selectinload(User.main_business),
            selectinload(Task.subtasks).selectinload(SubTask.assignee).selectinload(User.main_business),
            selectinload(Task.watchers).selectinload(User.main_business),
            selectinload(Task.status),
            selectinload(Task.priority),
        )
        .where(Task.id == task_id, Task.is_deleted == False)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: int, payload: TaskUpdate, db: DB, current_user: CurrentUser):
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.is_deleted == False)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    # Auto-set completed_at
    from app.models.catalog import TaskStatus as TaskStatusModel
    if payload.status_id:
        status_result = await db.execute(
            select(TaskStatusModel).where(TaskStatusModel.id == payload.status_id)
        )
        task_status = status_result.scalar_one_or_none()
        if task_status and task_status.is_done_state and not task.completed_at:
            from datetime import datetime, timezone
            task.completed_at = datetime.now(timezone.utc)

    await db.flush()
    # Reload with eager-loaded relationships to avoid async lazy-load error
    result2 = await db.execute(
        select(Task)
        .options(
            selectinload(Task.assignee).selectinload(User.main_business),
            selectinload(Task.reporter).selectinload(User.main_business),
            selectinload(Task.subtasks),
            selectinload(Task.status),
            selectinload(Task.priority),
            selectinload(Task.watchers).selectinload(User.main_business),
        )
        .where(Task.id == task.id)
    )
    task = result2.scalar_one()
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.is_deleted == False)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    task.is_deleted = True
    await db.flush()


class LogTimeBody(BaseModel):
    hours: float
    description: Optional[str] = None

    @field_validator("hours")
    @classmethod
    def hours_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Las horas deben ser un valor positivo mayor a 0")
        if v > 24:
            raise ValueError("No se pueden registrar más de 24 horas por entrada")
        return round(v, 2)


@router.post("/{task_id}/log-time", status_code=status.HTTP_200_OK)
async def log_time(task_id: int, payload: LogTimeBody, db: DB, current_user: CurrentUser):
    """Registra horas trabajadas en una tarea. Acumula en logged_hours."""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.is_deleted == False)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    task.logged_hours = (task.logged_hours or 0) + payload.hours
    await db.flush()
    return {
        "task_id": task_id,
        "hours_added": payload.hours,
        "total_logged_hours": task.logged_hours,
        "description": payload.description,
        "logged_by": current_user.full_name,
    }


@router.post("/{task_id}/subtasks", response_model=SubTaskResponse, status_code=201)
async def add_subtask(task_id: int, payload: SubTaskCreate, db: DB, current_user: CurrentUser):
    subtask = SubTask(
        title=payload.title,
        task_id=task_id,
        assignee_id=payload.assignee_id,
        order_index=payload.order_index,
    )
    db.add(subtask)
    await db.flush()
    # Reload with eager-loaded relationships to avoid async lazy-load error
    result2 = await db.execute(
        select(SubTask)
        .options(selectinload(SubTask.assignee).selectinload(User.main_business))
        .where(SubTask.id == subtask.id)
    )
    subtask = result2.scalar_one()
    return subtask


@router.patch("/{task_id}/subtasks/{subtask_id}", response_model=SubTaskResponse)
async def toggle_subtask(task_id: int, subtask_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(
        select(SubTask).where(SubTask.id == subtask_id, SubTask.task_id == task_id)
    )
    subtask = result.scalar_one_or_none()
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtarea no encontrada")
    subtask.is_completed = not subtask.is_completed
    await db.flush()
    result2 = await db.execute(
        select(SubTask).options(selectinload(SubTask.assignee).selectinload(User.main_business))
        .where(SubTask.id == subtask_id)
    )
    return result2.scalar_one()


class WatcherBody(BaseModel):
    user_id: int


@router.post("/{task_id}/watchers", status_code=200)
async def add_watcher(task_id: int, payload: WatcherBody, db: DB, current_user: CurrentUser):
    from app.models.task import task_watchers_table
    from sqlalchemy import insert as sa_insert
    result = await db.execute(select(Task).where(Task.id == task_id, Task.is_deleted == False))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    try:
        await db.execute(task_watchers_table.insert().values(task_id=task_id, user_id=payload.user_id))
        await db.flush()
    except Exception:
        pass  # Already watching
    return {"message": "Seguidor agregado"}


@router.delete("/{task_id}/watchers/{user_id}", status_code=200)
async def remove_watcher(task_id: int, user_id: int, db: DB, current_user: CurrentUser):
    from app.models.task import task_watchers_table
    await db.execute(
        task_watchers_table.delete().where(
            task_watchers_table.c.task_id == task_id,
            task_watchers_table.c.user_id == user_id
        )
    )
    await db.flush()
    return {"message": "Seguidor eliminado"}
