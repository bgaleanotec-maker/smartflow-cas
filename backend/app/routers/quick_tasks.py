"""Quick Tasks router — tareas puntuales sin proyecto."""
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, desc, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.deps import DB, CurrentUser, LeaderOrAdmin
from app.models.quick_task import QuickTask, QUICK_TASK_CATEGORIES
from app.models.user import User
from app.models.business import Business

router = APIRouter(prefix="/quick-tasks", tags=["Quick Tasks"])

# ─── Schemas ──────────────────────────────────────────────────────────────────

class QuickTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    business_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    priority: str = "media"
    category: str = "general"
    estimated_minutes: Optional[int] = None
    due_date: Optional[date] = None
    meeting_start: Optional[datetime] = None
    meeting_end: Optional[datetime] = None
    parent_id: Optional[int] = None


class QuickTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    business_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    estimated_minutes: Optional[int] = None
    logged_minutes: Optional[int] = None
    due_date: Optional[date] = None
    meeting_start: Optional[datetime] = None
    meeting_end: Optional[datetime] = None
    is_done: Optional[bool] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _task_dict(t: QuickTask, include_children: bool = False) -> dict:
    duration_min = None
    if t.meeting_start and t.meeting_end:
        delta = (t.meeting_end - t.meeting_start).total_seconds()
        duration_min = max(0, int(delta / 60))

    d = {
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
        "category": getattr(t, "category", "general") or "general",
        "meeting_start": t.meeting_start.isoformat() if t.meeting_start else None,
        "meeting_end": t.meeting_end.isoformat() if t.meeting_end else None,
        "meeting_duration_min": duration_min,
        "parent_id": t.parent_id,
        "estimated_minutes": t.estimated_minutes,
        "logged_minutes": t.logged_minutes,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "is_done": t.is_done,
        "done_at": t.done_at.isoformat() if t.done_at else None,
        "created_at": t.created_at.isoformat(),
    }
    if include_children:
        try:
            d["children_count"] = len(t.children)
            d["children"] = [_task_dict(c) for c in t.children]
        except Exception:
            d["children_count"] = 0
            d["children"] = []
    return d


async def _get_role(user) -> str:
    return str(user.role.value) if hasattr(user.role, 'value') else str(user.role)


async def _ids_by_role(db, role_name: str) -> list:
    from sqlalchemy import text as _t
    res = await db.execute(_t(f"SELECT id FROM users WHERE CAST(role AS VARCHAR) = '{role_name}'"))
    return [r[0] for r in res.fetchall()]


async def _team_of(db, user_id: int) -> Optional[str]:
    from sqlalchemy import text as _t
    res = await db.execute(_t(f"SELECT CAST(team AS VARCHAR) FROM users WHERE id = {user_id}"))
    row = res.fetchone()
    return row[0] if row and row[0] else None


async def _ids_by_team(db, team: str) -> list:
    from sqlalchemy import text as _t
    res = await db.execute(_t(f"SELECT id FROM users WHERE CAST(team AS VARCHAR) = '{team}'"))
    return [r[0] for r in res.fetchall()]


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=List[str])
async def get_categories():
    return QUICK_TASK_CATEGORIES


@router.get("/dashboard", response_model=dict)
async def quick_tasks_dashboard(
    db: DB = None,
    current_user: LeaderOrAdmin = None,
):
    """Leader/admin dashboard: tasks grouped by business + meeting overuse metrics."""
    from sqlalchemy import text as _t, or_ as _or
    role_val = await _get_role(current_user)
    lider_sr_ids = await _ids_by_role(db, "lider_sr")

    q = (
        select(QuickTask)
        .options(selectinload(QuickTask.user), selectinload(QuickTask.assigned_to), selectinload(QuickTask.business))
        .where(QuickTask.is_done == False, QuickTask.parent_id == None)
    )

    # Team-scoped for leader
    if role_val == "leader":
        if lider_sr_ids:
            q = q.where(~QuickTask.user_id.in_(lider_sr_ids))
        team = await _team_of(db, current_user.id)
        if team:
            team_ids = await _ids_by_team(db, team)
            if team_ids:
                q = q.where(QuickTask.user_id.in_(team_ids))

    q = q.order_by(QuickTask.priority.desc(), QuickTask.due_date.asc().nulls_last())
    all_tasks = (await db.execute(q)).scalars().all()

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
            "tasks": [_task_dict(t) for t in biz_tasks[:20]],
        }

    no_biz = [t for t in all_tasks if not t.business_id]
    overdue_all = [t for t in all_tasks if t.due_date and t.due_date < today]
    urgent_all = [t for t in all_tasks if t.priority == "urgente"]

    # ── Meeting overuse metrics ────────────────────────────────────────────────
    # Count meetings per user in last 30 days to detect overuse
    from datetime import timedelta
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    meeting_q = (
        select(QuickTask)
        .options(selectinload(QuickTask.user))
        .where(
            QuickTask.category == "reunion",
            QuickTask.created_at >= thirty_days_ago,
            QuickTask.parent_id == None,
        )
    )
    meeting_tasks = (await db.execute(meeting_q)).scalars().all()

    # Aggregate by user
    meeting_by_user: dict = {}
    for mt in meeting_tasks:
        uid = mt.user_id
        if uid not in meeting_by_user:
            meeting_by_user[uid] = {
                "user_id": uid,
                "user_name": mt.user.full_name if mt.user else "—",
                "count": 0,
                "total_minutes": 0,
            }
        meeting_by_user[uid]["count"] += 1
        if mt.meeting_start and mt.meeting_end:
            delta = (mt.meeting_end - mt.meeting_start).total_seconds()
            meeting_by_user[uid]["total_minutes"] += max(0, int(delta / 60))

    meeting_stats = sorted(meeting_by_user.values(), key=lambda x: x["count"], reverse=True)

    return {
        "total_active": len(all_tasks),
        "total_overdue": len(overdue_all),
        "total_urgent": len(urgent_all),
        "by_business": list(by_business.values()),
        "no_business": [_task_dict(t) for t in no_biz[:10]],
        "meeting_stats_30d": meeting_stats[:10],  # top 10 meeting users
    }


@router.get("", response_model=List[dict])
async def list_quick_tasks(
    business_id: Optional[int] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    include_done: bool = False,
    all_users: bool = False,
    assigned_to_id: Optional[int] = None,
    include_subtasks: bool = False,  # False = top-level only
    db: DB = None,
    current_user: CurrentUser = None,
):
    from sqlalchemy import text as _t, or_ as _or

    q = select(QuickTask).options(
        selectinload(QuickTask.user),
        selectinload(QuickTask.assigned_to),
        selectinload(QuickTask.business),
        selectinload(QuickTask.children).selectinload(QuickTask.user),
        selectinload(QuickTask.children).selectinload(QuickTask.assigned_to),
        selectinload(QuickTask.children).selectinload(QuickTask.business),
    )
    if not include_done:
        q = q.where(QuickTask.is_done == False)
    if not include_subtasks:
        # Show only top-level tasks by default
        q = q.where(QuickTask.parent_id == None)
    if business_id:
        q = q.where(QuickTask.business_id == business_id)
    if status:
        q = q.where(QuickTask.status == status)
    if category:
        q = q.where(QuickTask.category == category)

    role_val = await _get_role(current_user)
    lider_sr_ids = await _ids_by_role(db, "lider_sr")

    if role_val in ("admin", "lider_sr"):
        # Admin and lider_sr: see everything
        if assigned_to_id:
            q = q.where(_or(QuickTask.user_id == assigned_to_id, QuickTask.assigned_to_id == assigned_to_id))
    else:
        # Exclude lider_sr tasks for everyone else
        if lider_sr_ids:
            q = q.where(~QuickTask.user_id.in_(lider_sr_ids))

        # Team-based scoping (CAS/BO isolation)
        team = await _team_of(db, current_user.id)

        if role_val == "leader":
            if team:
                team_ids = await _ids_by_team(db, team)
                if assigned_to_id:
                    q = q.where(_or(QuickTask.user_id == assigned_to_id, QuickTask.assigned_to_id == assigned_to_id))
                elif team_ids:
                    q = q.where(QuickTask.user_id.in_(team_ids))
            else:
                if assigned_to_id:
                    q = q.where(_or(QuickTask.user_id == assigned_to_id, QuickTask.assigned_to_id == assigned_to_id))
                # else no restriction for leader without team
        else:
            # Regular users: own tasks + assigned to me
            # If team known, also restrict to team scope (so CAS user doesn't see BO tasks assigned to them by BO leader edge case)
            q = q.where(
                _or(QuickTask.user_id == current_user.id, QuickTask.assigned_to_id == current_user.id)
            )

    q = q.order_by(
        QuickTask.is_done.asc(),
        QuickTask.priority.desc(),
        QuickTask.due_date.asc().nulls_last(),
        desc(QuickTask.created_at)
    )
    result = await db.execute(q)
    return [_task_dict(t, include_children=True) for t in result.scalars().all()]


@router.post("", response_model=dict)
async def create_quick_task(
    data: QuickTaskCreate,
    db: DB = None,
    current_user: CurrentUser = None,
):
    category = data.category or "general"
    task = QuickTask(
        user_id=current_user.id,
        title=data.title,
        description=data.description,
        business_id=data.business_id,
        assigned_to_id=data.assigned_to_id,
        priority=data.priority,
        category=category,
        estimated_minutes=data.estimated_minutes,
        due_date=data.due_date,
        meeting_start=data.meeting_start if category == "reunion" else None,
        meeting_end=data.meeting_end if category == "reunion" else None,
        parent_id=data.parent_id,
        status="asignada" if data.assigned_to_id and data.assigned_to_id != current_user.id else "pendiente",
    )
    db.add(task)
    await db.flush()
    # reload with relationships
    result = await db.execute(
        select(QuickTask)
        .options(
            selectinload(QuickTask.user),
            selectinload(QuickTask.assigned_to),
            selectinload(QuickTask.business),
            selectinload(QuickTask.children).selectinload(QuickTask.user),
            selectinload(QuickTask.children).selectinload(QuickTask.assigned_to),
        )
        .where(QuickTask.id == task.id)
    )
    task = result.scalar_one()
    await db.commit()
    return _task_dict(task, include_children=True)


@router.get("/{task_id}", response_model=dict)
async def get_quick_task(
    task_id: int,
    db: DB = None,
    current_user: CurrentUser = None,
):
    result = await db.execute(
        select(QuickTask)
        .options(
            selectinload(QuickTask.user),
            selectinload(QuickTask.assigned_to),
            selectinload(QuickTask.business),
            selectinload(QuickTask.children).selectinload(QuickTask.user),
            selectinload(QuickTask.children).selectinload(QuickTask.assigned_to),
        )
        .where(QuickTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return _task_dict(task, include_children=True)


@router.get("/{task_id}/subtasks", response_model=List[dict])
async def list_subtasks(
    task_id: int,
    db: DB = None,
    current_user: CurrentUser = None,
):
    """List sub-tasks of a parent task (e.g. action items from a meeting)."""
    result = await db.execute(
        select(QuickTask)
        .options(
            selectinload(QuickTask.user),
            selectinload(QuickTask.assigned_to),
            selectinload(QuickTask.business),
        )
        .where(QuickTask.parent_id == task_id)
        .order_by(QuickTask.created_at.asc())
    )
    return [_task_dict(t) for t in result.scalars().all()]


@router.post("/{task_id}/subtasks", response_model=dict)
async def create_subtask(
    task_id: int,
    data: QuickTaskCreate,
    db: DB = None,
    current_user: CurrentUser = None,
):
    """Create a sub-task under a parent task (meeting action item)."""
    parent = await db.get(QuickTask, task_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Tarea padre no encontrada")

    sub = QuickTask(
        user_id=current_user.id,
        title=data.title,
        description=data.description,
        business_id=data.business_id or parent.business_id,
        assigned_to_id=data.assigned_to_id,
        priority=data.priority,
        category=data.category or "general",
        estimated_minutes=data.estimated_minutes,
        due_date=data.due_date,
        parent_id=task_id,
        status="asignada" if data.assigned_to_id and data.assigned_to_id != current_user.id else "pendiente",
    )
    db.add(sub)
    await db.flush()
    result = await db.execute(
        select(QuickTask)
        .options(selectinload(QuickTask.user), selectinload(QuickTask.assigned_to), selectinload(QuickTask.business))
        .where(QuickTask.id == sub.id)
    )
    sub = result.scalar_one()
    await db.commit()
    return _task_dict(sub)


@router.patch("/{task_id}", response_model=dict)
async def update_quick_task(
    task_id: int,
    data: QuickTaskUpdate,
    db: DB = None,
    current_user: CurrentUser = None,
):
    result = await db.execute(
        select(QuickTask)
        .options(
            selectinload(QuickTask.user),
            selectinload(QuickTask.assigned_to),
            selectinload(QuickTask.business),
            selectinload(QuickTask.children).selectinload(QuickTask.user),
            selectinload(QuickTask.children).selectinload(QuickTask.assigned_to),
        )
        .where(QuickTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")

    role_val = await _get_role(current_user)
    can_edit = (
        task.user_id == current_user.id
        or task.assigned_to_id == current_user.id
        or role_val in ("admin", "leader", "lider_sr")
    )
    if not can_edit:
        raise HTTPException(status_code=403, detail="Sin permiso para editar esta tarea")

    for field, val in data.model_dump(exclude_none=True).items():
        setattr(task, field, val)
    if data.is_done:
        task.done_at = datetime.utcnow()
        task.status = "completada"
        # Also complete all sub-tasks
        if task.children:
            for child in task.children:
                child.is_done = True
                child.done_at = datetime.utcnow()
                child.status = "completada"
    task.updated_at = datetime.utcnow()
    await db.commit()
    return _task_dict(task, include_children=True)


@router.delete("/{task_id}", status_code=204)
async def delete_quick_task(
    task_id: int,
    db: DB = None,
    current_user: CurrentUser = None,
):
    task = await db.get(QuickTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    role_val = await _get_role(current_user)
    if task.user_id != current_user.id and role_val not in ("admin", "leader", "lider_sr"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    # Delete sub-tasks first
    sub_result = await db.execute(select(QuickTask).where(QuickTask.parent_id == task_id))
    for child in sub_result.scalars().all():
        await db.delete(child)
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
