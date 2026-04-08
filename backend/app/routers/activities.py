from typing import Optional, List
from datetime import date, datetime, timedelta
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.deps import DB, CurrentUser, HerramientasOrAbove
from app.models.activities import (
    RecurringActivity, ActivityInstance, ActivityFrequency, ActivityStatus, ActivityScope,
)

router = APIRouter(prefix="/activities", tags=["Torre de Control - Actividades"])


class ActivityCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "gestion"
    frequency: str
    scope: str = "TODOS"
    priority: str = "media"
    start_date: date
    end_date: Optional[date] = None
    due_time: Optional[str] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    reminder_days_before: int = 1
    assigned_to_id: Optional[int] = None
    business_id: Optional[int] = None
    tags: Optional[str] = None
    color: str = "#6366f1"


class ActivityUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    scope: Optional[str] = None
    assigned_to_id: Optional[int] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None
    color: Optional[str] = None


class InstanceUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    evidence: Optional[str] = None
    assigned_to_id: Optional[int] = None


def _generate_instances(activity: RecurringActivity, from_date: date, to_date: date) -> list:
    """Generate activity instances for a date range based on frequency."""
    instances = []
    current = max(activity.start_date, from_date)

    if activity.frequency == ActivityFrequency.UNICA:
        if activity.start_date >= from_date and activity.start_date <= to_date:
            instances.append(activity.start_date)
    elif activity.frequency == ActivityFrequency.DIARIA:
        while current <= to_date:
            instances.append(current)
            current += timedelta(days=1)
    elif activity.frequency == ActivityFrequency.SEMANAL:
        dow = activity.day_of_week or 0
        while current <= to_date:
            if current.weekday() == dow:
                instances.append(current)
            current += timedelta(days=1)
    elif activity.frequency == ActivityFrequency.QUINCENAL:
        while current <= to_date:
            instances.append(current)
            current += timedelta(days=14)
    elif activity.frequency == ActivityFrequency.MENSUAL:
        dom = activity.day_of_month or 1
        while current <= to_date:
            try:
                d = current.replace(day=dom)
                if d >= from_date and d <= to_date:
                    instances.append(d)
            except ValueError:
                pass
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1, day=1)
            else:
                current = current.replace(month=current.month + 1, day=1)
    elif activity.frequency == ActivityFrequency.TRIMESTRAL:
        while current <= to_date:
            instances.append(current)
            month = current.month + 3
            year = current.year + (month - 1) // 12
            month = ((month - 1) % 12) + 1
            try:
                current = current.replace(year=year, month=month)
            except ValueError:
                break

    if activity.end_date:
        instances = [d for d in instances if d <= activity.end_date]
    return instances


@router.post("", status_code=201)
async def create_activity(payload: ActivityCreate, db: DB, user: CurrentUser):
    activity = RecurringActivity(created_by_id=user.id, **payload.model_dump())
    db.add(activity)
    await db.flush()

    # Generate first instances (next 90 days)
    today = date.today()
    future = today + timedelta(days=90)
    dates = _generate_instances(activity, today, future)
    for d in dates[:50]:  # cap at 50
        db.add(ActivityInstance(
            activity_id=activity.id, title=activity.title,
            due_date=d, assigned_to_id=activity.assigned_to_id,
        ))
    await db.flush()
    await db.refresh(activity)
    return {"id": activity.id, "instances_created": len(dates[:50])}


@router.get("")
async def list_activities(
    db: DB, user: CurrentUser,
    scope: Optional[str] = None, category: Optional[str] = None,
    active_only: bool = True, skip: int = 0, limit: int = 50,
):
    query = select(RecurringActivity).options(
        selectinload(RecurringActivity.assigned_to),
        selectinload(RecurringActivity.created_by),
    )
    if active_only:
        query = query.where(RecurringActivity.is_active == True)
    if scope:
        query = query.where(RecurringActivity.scope == scope)
    if category:
        query = query.where(RecurringActivity.category == category)
    query = query.order_by(RecurringActivity.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    activities = result.scalars().all()
    return [{
        "id": a.id, "title": a.title, "description": a.description,
        "category": a.category, "frequency": a.frequency.value,
        "scope": a.scope.value, "priority": a.priority,
        "start_date": str(a.start_date), "end_date": str(a.end_date) if a.end_date else None,
        "due_time": a.due_time, "day_of_week": a.day_of_week, "day_of_month": a.day_of_month,
        "reminder_days_before": a.reminder_days_before,
        "assigned_to": {"id": a.assigned_to.id, "full_name": a.assigned_to.full_name} if a.assigned_to else None,
        "created_by": {"id": a.created_by.id, "full_name": a.created_by.full_name} if a.created_by else None,
        "color": a.color, "tags": a.tags, "is_active": a.is_active,
    } for a in activities]


@router.patch("/{activity_id}")
async def update_activity(activity_id: int, payload: ActivityUpdate, db: DB, user: CurrentUser):
    result = await db.execute(select(RecurringActivity).where(RecurringActivity.id == activity_id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(a, field, value)
    await db.flush()
    return {"id": a.id}


@router.delete("/{activity_id}", status_code=204)
async def delete_activity(activity_id: int, db: DB, user: CurrentUser):
    result = await db.execute(select(RecurringActivity).where(RecurringActivity.id == activity_id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    a.is_active = False
    await db.flush()


# ─── Instances (Torre de Control) ────────────────────────────────────────────

@router.get("/instances")
async def list_instances(
    db: DB, user: CurrentUser,
    status: Optional[str] = None,
    scope: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    assigned_to_id: Optional[int] = None,
    skip: int = 0, limit: int = 100,
):
    query = (
        select(ActivityInstance)
        .join(RecurringActivity)
        .options(
            selectinload(ActivityInstance.activity),
            selectinload(ActivityInstance.assigned_to),
            selectinload(ActivityInstance.completed_by),
        )
        .where(RecurringActivity.is_active == True)
    )
    if status:
        query = query.where(ActivityInstance.status == status)
    if scope:
        query = query.where(RecurringActivity.scope == scope)
    if from_date:
        query = query.where(ActivityInstance.due_date >= from_date)
    if to_date:
        query = query.where(ActivityInstance.due_date <= to_date)
    if assigned_to_id:
        query = query.where(ActivityInstance.assigned_to_id == assigned_to_id)

    query = query.order_by(ActivityInstance.due_date).offset(skip).limit(limit)
    result = await db.execute(query)
    instances = result.scalars().all()

    today = date.today()
    items = []
    for i in instances:
        # Auto-compute status
        computed_status = i.status.value
        if i.status == ActivityStatus.SIN_INICIAR:
            if i.due_date < today:
                computed_status = "vencida"
            elif i.due_date <= today + timedelta(days=i.activity.reminder_days_before if i.activity else 1):
                computed_status = "proxima_a_vencer"

        items.append({
            "id": i.id, "activity_id": i.activity_id, "title": i.title,
            "status": computed_status, "original_status": i.status.value,
            "due_date": str(i.due_date),
            "completed_date": str(i.completed_date) if i.completed_date else None,
            "notes": i.notes, "evidence": i.evidence,
            "assigned_to": {"id": i.assigned_to.id, "full_name": i.assigned_to.full_name} if i.assigned_to else None,
            "completed_by": {"id": i.completed_by.id, "full_name": i.completed_by.full_name} if i.completed_by else None,
            "activity": {
                "frequency": i.activity.frequency.value,
                "category": i.activity.category,
                "scope": i.activity.scope.value,
                "priority": i.activity.priority,
                "color": i.activity.color,
            } if i.activity else None,
        })
    return items


@router.patch("/instances/{instance_id}")
async def update_instance(instance_id: int, payload: InstanceUpdate, db: DB, user: CurrentUser):
    result = await db.execute(select(ActivityInstance).where(ActivityInstance.id == instance_id))
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Instancia no encontrada")

    update_data = payload.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] == "completada":
        update_data["completed_date"] = date.today()
        update_data["completed_by_id"] = user.id

    for field, value in update_data.items():
        setattr(inst, field, value)
    await db.flush()
    return {"id": inst.id, "status": inst.status.value}


# ─── Torre de Control Dashboard ──────────────────────────────────────────────

@router.get("/torre-control")
async def torre_control(db: DB, user: CurrentUser, scope: Optional[str] = None):
    """Dashboard data for the control tower view."""
    today = date.today()
    week_end = today + timedelta(days=7)

    base = select(ActivityInstance).join(RecurringActivity).where(RecurringActivity.is_active == True)
    if scope:
        base = base.where(RecurringActivity.scope == scope)

    # Vencidas
    vencidas = await db.execute(
        base.where(ActivityInstance.due_date < today, ActivityInstance.status.in_([ActivityStatus.SIN_INICIAR, ActivityStatus.EN_PROCESO]))
        .options(selectinload(ActivityInstance.activity), selectinload(ActivityInstance.assigned_to))
        .order_by(ActivityInstance.due_date)
        .limit(20)
    )
    # Proximas a vencer (esta semana)
    proximas = await db.execute(
        base.where(ActivityInstance.due_date >= today, ActivityInstance.due_date <= week_end, ActivityInstance.status.in_([ActivityStatus.SIN_INICIAR, ActivityStatus.EN_PROCESO]))
        .options(selectinload(ActivityInstance.activity), selectinload(ActivityInstance.assigned_to))
        .order_by(ActivityInstance.due_date)
        .limit(20)
    )
    # Completadas esta semana
    completadas_count = (await db.execute(
        select(func.count(ActivityInstance.id)).select_from(ActivityInstance).join(RecurringActivity)
        .where(RecurringActivity.is_active == True, ActivityInstance.status == ActivityStatus.COMPLETADA, ActivityInstance.completed_date >= today - timedelta(days=7))
    )).scalar()
    # Total pendientes
    pendientes_count = (await db.execute(
        select(func.count(ActivityInstance.id)).select_from(ActivityInstance).join(RecurringActivity)
        .where(RecurringActivity.is_active == True, ActivityInstance.status.in_([ActivityStatus.SIN_INICIAR, ActivityStatus.EN_PROCESO]))
    )).scalar()
    # Total vencidas
    vencidas_count = (await db.execute(
        select(func.count(ActivityInstance.id)).select_from(ActivityInstance).join(RecurringActivity)
        .where(RecurringActivity.is_active == True, ActivityInstance.due_date < today, ActivityInstance.status.in_([ActivityStatus.SIN_INICIAR, ActivityStatus.EN_PROCESO]))
    )).scalar()
    # By category
    by_category = await db.execute(
        select(RecurringActivity.category, func.count(ActivityInstance.id))
        .select_from(ActivityInstance).join(RecurringActivity)
        .where(RecurringActivity.is_active == True, ActivityInstance.status.in_([ActivityStatus.SIN_INICIAR, ActivityStatus.EN_PROCESO]))
        .group_by(RecurringActivity.category)
    )
    # By scope
    by_scope = await db.execute(
        select(RecurringActivity.scope, func.count(ActivityInstance.id))
        .select_from(ActivityInstance).join(RecurringActivity)
        .where(RecurringActivity.is_active == True, ActivityInstance.status.in_([ActivityStatus.SIN_INICIAR, ActivityStatus.EN_PROCESO]))
        .group_by(RecurringActivity.scope)
    )

    def _inst_to_dict(i):
        return {
            "id": i.id, "title": i.title, "status": i.status.value,
            "due_date": str(i.due_date),
            "assigned_to": i.assigned_to.full_name if i.assigned_to else None,
            "category": i.activity.category if i.activity else None,
            "priority": i.activity.priority if i.activity else None,
            "scope": i.activity.scope.value if i.activity else None,
            "color": i.activity.color if i.activity else "#6366f1",
            "days_overdue": (today - i.due_date).days if i.due_date < today else 0,
        }

    return {
        "kpis": {
            "pendientes": pendientes_count,
            "vencidas": vencidas_count,
            "completadas_semana": completadas_count,
            "cumplimiento_pct": round((completadas_count / max(completadas_count + pendientes_count, 1)) * 100, 1),
        },
        "vencidas": [_inst_to_dict(i) for i in vencidas.scalars().all()],
        "proximas": [_inst_to_dict(i) for i in proximas.scalars().all()],
        "by_category": {r[0]: r[1] for r in by_category},
        "by_scope": {(r[0].value if hasattr(r[0], 'value') else r[0]): r[1] for r in by_scope},
    }
