"""
Torre de Control — Actividades Recurrentes

NUEVA LÓGICA (reformulada 2026-04-12):
  - RecurringActivity = PLANTILLA con frecuencia. NO genera instancias futuras.
  - ActivityInstance = LOG de cumplimiento (solo instancias pasadas/actuales registradas).
  - compute_current_period() calcula en tiempo real cuándo corresponde la actividad HOY.
  - Torre de Control muestra cada actividad UNA VEZ con su estado real.
  - Marcar como cumplida = crear/actualizar instancia para el período actual.
  - Escalado automático: si no se completa en X horas, notifica a escalate_to_id.
  - Recordatorio: X minutos/horas/días antes por sistema/email/whatsapp.
"""
from typing import Optional, List
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, func, and_, desc
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.deps import DB, CurrentUser
from app.models.activities import (
    RecurringActivity, ActivityInstance, ActivityFrequency, ActivityStatus, ActivityScope,
)
from app.models.user import User

router = APIRouter(prefix="/activities", tags=["Torre de Control - Actividades"])


# ─── Helpers — period calculation ─────────────────────────────────────────────

def compute_current_due_date(a: RecurringActivity) -> Optional[date]:
    """
    Returns the date of the CURRENT period's expected occurrence.
    This is the date the activity SHOULD happen (or should have happened) most recently.
    """
    today = date.today()
    if a.start_date > today:
        return a.start_date  # hasn't started yet
    if a.end_date and today > a.end_date:
        return None  # expired

    if a.frequency in (ActivityFrequency.UNICA, 'unica', 'inbox', 'once'):
        return a.start_date

    elif a.frequency == ActivityFrequency.DIARIA:
        return today

    elif a.frequency == ActivityFrequency.SEMANAL:
        target_dow = a.day_of_week if a.day_of_week is not None else a.start_date.weekday()
        days_ago = (today.weekday() - target_dow) % 7
        candidate = today - timedelta(days=days_ago)
        return candidate if candidate >= a.start_date else None

    elif a.frequency == ActivityFrequency.QUINCENAL:
        delta = (today - a.start_date).days
        periods = delta // 14
        return a.start_date + timedelta(days=periods * 14)

    elif a.frequency == ActivityFrequency.MENSUAL:
        dom = a.day_of_month or a.start_date.day
        try:
            candidate = today.replace(day=dom)
        except ValueError:
            import calendar
            last_day = calendar.monthrange(today.year, today.month)[1]
            candidate = today.replace(day=min(dom, last_day))
        if candidate > today:
            # Previous month
            if today.month == 1:
                prev = today.replace(year=today.year - 1, month=12, day=dom)
            else:
                try:
                    prev = today.replace(month=today.month - 1, day=dom)
                except ValueError:
                    prev = candidate
            candidate = prev
        return candidate if candidate >= a.start_date else None

    elif a.frequency == ActivityFrequency.TRIMESTRAL:
        delta = (today - a.start_date).days
        periods = delta // 91
        return a.start_date + timedelta(days=periods * 91)

    elif a.frequency == ActivityFrequency.SEMESTRAL:
        delta = (today - a.start_date).days
        periods = delta // 182
        return a.start_date + timedelta(days=periods * 182)

    elif a.frequency == ActivityFrequency.ANUAL:
        try:
            candidate = a.start_date.replace(year=today.year)
        except ValueError:
            candidate = a.start_date.replace(year=today.year, day=28)
        if candidate > today:
            try:
                candidate = a.start_date.replace(year=today.year - 1)
            except ValueError:
                candidate = a.start_date.replace(year=today.year - 1, day=28)
        return candidate if candidate >= a.start_date else None

    return today


def compute_next_due_date(a: RecurringActivity) -> Optional[date]:
    """Returns the NEXT expected occurrence after today."""
    today = date.today()
    current = compute_current_due_date(a)
    if current is None:
        return None
    if a.frequency == ActivityFrequency.UNICA:
        return None
    if a.frequency == ActivityFrequency.DIARIA:
        return today + timedelta(days=1)
    if a.frequency == ActivityFrequency.SEMANAL:
        return current + timedelta(weeks=1)
    if a.frequency == ActivityFrequency.QUINCENAL:
        return current + timedelta(days=14)
    if a.frequency == ActivityFrequency.MENSUAL:
        month = current.month + 1
        year = current.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        dom = a.day_of_month or a.start_date.day
        try:
            return current.replace(year=year, month=month, day=dom)
        except ValueError:
            return current.replace(year=year, month=month, day=28)
    if a.frequency == ActivityFrequency.TRIMESTRAL:
        return current + timedelta(days=91)
    if a.frequency == ActivityFrequency.SEMESTRAL:
        return current + timedelta(days=182)
    if a.frequency == ActivityFrequency.ANUAL:
        try:
            return current.replace(year=current.year + 1)
        except ValueError:
            return current.replace(year=current.year + 1, day=28)
    return None


def compute_activity_status(a: RecurringActivity, current_instance: Optional[ActivityInstance]) -> str:
    """Compute real-time status for a recurring activity."""
    today = date.today()
    current_due = compute_current_due_date(a)

    if current_due is None:
        return "sin_iniciar"  # not started yet or expired

    if current_instance and current_instance.status == ActivityStatus.COMPLETADA:
        return "completada"

    if current_instance and current_instance.status == ActivityStatus.EN_PROCESO:
        return "en_proceso"

    # For single-occurrence activities (unica/inbox/once)
    if a.frequency in (ActivityFrequency.UNICA, 'unica', 'inbox', 'once'):
        if current_due < today:
            return "vencida"
        return "sin_iniciar"

    # Check if overdue
    due_datetime = datetime.combine(current_due, datetime.min.time()).replace(tzinfo=timezone.utc)
    if a.due_time:
        try:
            h, m = map(int, a.due_time.split(":"))
            due_datetime = datetime.combine(current_due, datetime.min.time().replace(hour=h, minute=m)).replace(tzinfo=timezone.utc)
        except Exception:
            pass

    now = datetime.now(timezone.utc)

    if current_due < today:
        return "vencida"

    # Check if reminder window — X units before due
    unit = a.notify_before_unit or "dias"
    val = a.notify_before_value or 1
    if unit == "minutos":
        reminder_delta = timedelta(minutes=val)
    elif unit == "horas":
        reminder_delta = timedelta(hours=val)
    else:
        reminder_delta = timedelta(days=val)

    reminder_start = due_datetime - reminder_delta
    if now >= reminder_start:
        return "proxima_a_vencer"

    return "sin_iniciar"


def _streak(instances: list) -> int:
    """Count consecutive completed periods (most recent first)."""
    streak = 0
    for inst in sorted(instances, key=lambda x: x.due_date, reverse=True):
        if inst.status == ActivityStatus.COMPLETADA:
            streak += 1
        else:
            break
    return streak


def _activity_to_dict(a: RecurringActivity, current_instance: Optional[ActivityInstance], log: list) -> dict:
    today = date.today()
    current_due = compute_current_due_date(a)
    next_due = compute_next_due_date(a)
    status = compute_activity_status(a, current_instance)
    days_overdue = (today - current_due).days if (current_due and current_due < today and status == "vencida") else 0

    # Escalation check
    escalated = False
    if status == "vencida" and a.escalate_to_id and current_instance:
        overdue_hours = days_overdue * 24
        if overdue_hours >= a.escalate_after_hours:
            escalated = True

    return {
        "id": a.id,
        "title": a.title,
        "description": a.description,
        "category": a.category,
        "frequency": a.frequency.value,
        "scope": a.scope.value,
        "priority": a.priority,
        "color": a.color,
        "due_time": a.due_time,
        "start_date": str(a.start_date),
        "end_date": str(a.end_date) if a.end_date else None,
        # Notification config
        "notify_before_value": a.notify_before_value,
        "notify_before_unit": a.notify_before_unit,
        "notify_channel": a.notify_channel,
        "escalate_after_hours": a.escalate_after_hours,
        "escalate_to": {"id": a.escalate_to.id, "full_name": a.escalate_to.full_name} if a.escalate_to else None,
        # Computed state
        "status": status,
        "current_due_date": str(current_due) if current_due else None,
        "next_due_date": str(next_due) if next_due else None,
        "days_overdue": days_overdue,
        "streak": _streak(log),
        "escalated": escalated,
        # Assignment
        "assigned_to": {"id": a.assigned_to.id, "full_name": a.assigned_to.full_name} if a.assigned_to else None,
        "created_by": {"id": a.created_by.id, "full_name": a.created_by.full_name} if a.created_by else None,
        # Current instance info
        "current_instance_id": current_instance.id if current_instance else None,
        "completed_at": str(current_instance.completed_date) if (current_instance and current_instance.completed_date) else None,
        "completed_by": current_instance.completed_by.full_name if (current_instance and current_instance.completed_by) else None,
        "notes": current_instance.notes if current_instance else None,
        # Log (last 10)
        "log": [
            {
                "id": inst.id,
                "due_date": str(inst.due_date),
                "status": inst.status.value,
                "completed_date": str(inst.completed_date) if inst.completed_date else None,
                "completed_by": inst.completed_by.full_name if inst.completed_by else None,
                "notes": inst.notes,
            }
            for inst in sorted(log, key=lambda x: x.due_date, reverse=True)[:10]
        ],
        "is_active": a.is_active,
        "pomodoro_minutes": a.pomodoro_minutes or 0,
    }


# ─── Schemas ──────────────────────────────────────────────────────────────────

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
    # Notification
    notify_before_value: int = 1
    notify_before_unit: str = "dias"
    notify_channel: str = "sistema"
    escalate_to_id: Optional[int] = None
    escalate_after_hours: int = 24
    # Assignment
    assigned_to_id: Optional[int] = None
    business_id: Optional[int] = None
    color: str = "#6366f1"
    tags: Optional[str] = None


class ActivityUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    scope: Optional[str] = None
    assigned_to_id: Optional[int] = None
    end_date: Optional[date] = None
    due_time: Optional[str] = None
    is_active: Optional[bool] = None
    color: Optional[str] = None
    notify_before_value: Optional[int] = None
    notify_before_unit: Optional[str] = None
    notify_channel: Optional[str] = None
    escalate_to_id: Optional[int] = None
    escalate_after_hours: Optional[int] = None


class CompleteActivityBody(BaseModel):
    notes: Optional[str] = None
    evidence: Optional[str] = None


# ─── CRUD endpoints ───────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_activity(payload: ActivityCreate, db: DB, user: CurrentUser):
    """Create a recurring activity template. No instances generated upfront."""
    data = payload.model_dump()
    # reminder_days_before kept in sync with notify_before for legacy compat
    data["reminder_days_before"] = payload.notify_before_value if payload.notify_before_unit == "dias" else 1
    activity = RecurringActivity(created_by_id=user.id, **data)
    db.add(activity)
    await db.flush()
    await db.refresh(activity)
    return {"id": activity.id, "message": "Actividad creada. Las instancias se registran al cumplirlas."}


@router.get("")
async def list_activities(
    db: DB, user: CurrentUser,
    scope: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True,
    skip: int = 0, limit: int = 100,
):
    """List activity templates with computed real-time status."""
    query = select(RecurringActivity).options(
        selectinload(RecurringActivity.assigned_to).selectinload(User.main_business),
        selectinload(RecurringActivity.created_by).selectinload(User.main_business),
        selectinload(RecurringActivity.escalate_to).selectinload(User.main_business),
        selectinload(RecurringActivity.instances).selectinload(ActivityInstance.completed_by).selectinload(User.main_business),
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

    today = date.today()
    out = []
    for a in activities:
        current_due = compute_current_due_date(a)
        # Find current period's instance
        current_inst = None
        if current_due:
            for inst in a.instances:
                if inst.due_date == current_due:
                    current_inst = inst
                    break
        out.append(_activity_to_dict(a, current_inst, list(a.instances)))
    return out


@router.patch("/{activity_id}")
async def update_activity(activity_id: int, payload: ActivityUpdate, db: DB, user: CurrentUser):
    result = await db.execute(select(RecurringActivity).where(RecurringActivity.id == activity_id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(a, field, value)
    await db.flush()
    return {"id": a.id, "message": "Actualizada"}


@router.delete("/{activity_id}", status_code=204)
async def delete_activity(activity_id: int, db: DB, user: CurrentUser):
    result = await db.execute(select(RecurringActivity).where(RecurringActivity.id == activity_id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    # Admin/leader: hard delete; others: deactivate
    if user.role in ("admin", "leader"):
        await db.delete(a)
    else:
        a.is_active = False
    await db.flush()


# ─── Compliance — mark current period as done ────────────────────────────────

@router.post("/{activity_id}/complete")
async def complete_activity(activity_id: int, body: CompleteActivityBody, db: DB, user: CurrentUser):
    """
    Mark the CURRENT period of a recurring activity as completed.
    Creates or updates the ActivityInstance for today's period.
    """
    result = await db.execute(
        select(RecurringActivity)
        .options(selectinload(RecurringActivity.assigned_to).selectinload(User.main_business))
        .where(RecurringActivity.id == activity_id, RecurringActivity.is_active == True)
    )
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    current_due = compute_current_due_date(a)
    if not current_due:
        raise HTTPException(status_code=400, detail="No hay período actual para esta actividad")

    # Find or create instance for this period
    inst_result = await db.execute(
        select(ActivityInstance).where(
            ActivityInstance.activity_id == activity_id,
            ActivityInstance.due_date == current_due,
        )
    )
    inst = inst_result.scalar_one_or_none()

    today = date.today()
    if inst:
        inst.status = ActivityStatus.COMPLETADA
        inst.completed_date = today
        inst.completed_by_id = user.id
        if body.notes:
            inst.notes = body.notes
    else:
        inst = ActivityInstance(
            activity_id=activity_id,
            title=a.title,
            due_date=current_due,
            status=ActivityStatus.COMPLETADA,
            completed_date=today,
            completed_by_id=user.id,
            assigned_to_id=a.assigned_to_id,
            notes=body.notes,
            evidence=body.evidence,
        )
        db.add(inst)

    await db.flush()
    return {
        "message": f"✓ '{a.title}' marcada como cumplida para {current_due}",
        "due_date": str(current_due),
        "next_due_date": str(compute_next_due_date(a)),
    }


@router.post("/{activity_id}/start")
async def start_activity(activity_id: int, db: DB, user: CurrentUser):
    """Mark current period as in-progress."""
    result = await db.execute(
        select(RecurringActivity).where(RecurringActivity.id == activity_id, RecurringActivity.is_active == True)
    )
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    current_due = compute_current_due_date(a)
    if not current_due:
        raise HTTPException(status_code=400, detail="Sin período actual")

    inst_result = await db.execute(
        select(ActivityInstance).where(
            ActivityInstance.activity_id == activity_id,
            ActivityInstance.due_date == current_due,
        )
    )
    inst = inst_result.scalar_one_or_none()
    if inst:
        inst.status = ActivityStatus.EN_PROCESO
    else:
        inst = ActivityInstance(
            activity_id=activity_id,
            title=a.title,
            due_date=current_due,
            status=ActivityStatus.EN_PROCESO,
            assigned_to_id=a.assigned_to_id,
        )
        db.add(inst)
    await db.flush()
    return {"message": "En proceso", "due_date": str(current_due)}


# ─── Torre de Control Dashboard ──────────────────────────────────────────────

@router.get("/torre-control")
async def torre_control(db: DB, user: CurrentUser, scope: Optional[str] = None, category: Optional[str] = None, assigned_to_id: Optional[int] = None):
    """
    Dashboard: each recurring activity shown ONCE with real-time computed status.
    Groups by: vencidas | proximas_a_vencer | en_proceso | sin_iniciar | completadas.
    """
    query = select(RecurringActivity).options(
        selectinload(RecurringActivity.assigned_to).selectinload(User.main_business),
        selectinload(RecurringActivity.created_by).selectinload(User.main_business),
        selectinload(RecurringActivity.escalate_to).selectinload(User.main_business),
        selectinload(RecurringActivity.instances).selectinload(ActivityInstance.completed_by).selectinload(User.main_business),
    ).where(RecurringActivity.is_active == True)
    if scope:
        query = query.where(RecurringActivity.scope == scope)
    if category:
        query = query.where(RecurringActivity.category == category)
    if assigned_to_id:
        query = query.where(RecurringActivity.assigned_to_id == assigned_to_id)

    # Role-based visibility (use raw SQL text for role comparisons to avoid PG enum cast issues)
    from sqlalchemy import text as _text, or_ as _or
    role = user.role
    if role == "leader":
        lider_sr_res = await db.execute(_text("SELECT id FROM users WHERE role::text = 'lider_sr'"))
        lider_sr_ids = [r[0] for r in lider_sr_res.fetchall()]
        if lider_sr_ids:
            query = query.where(
                _or(
                    ~RecurringActivity.created_by_id.in_(lider_sr_ids),
                    RecurringActivity.assigned_to_id == user.id,
                    RecurringActivity.created_by_id == user.id,
                )
            )
    elif role == "negocio":
        neg_res = await db.execute(_text("SELECT id FROM users WHERE role::text = 'negocio'"))
        neg_ids = [r[0] for r in neg_res.fetchall()]
        if neg_ids:
            query = query.where(_or(RecurringActivity.created_by_id.in_(neg_ids), RecurringActivity.assigned_to_id == user.id))
        else:
            query = query.where(RecurringActivity.assigned_to_id == user.id)
    elif role == "herramientas":
        herr_res = await db.execute(_text("SELECT id FROM users WHERE role::text = 'herramientas'"))
        herr_ids = [r[0] for r in herr_res.fetchall()]
        if herr_ids:
            query = query.where(_or(RecurringActivity.created_by_id.in_(herr_ids), RecurringActivity.assigned_to_id == user.id))
        else:
            query = query.where(RecurringActivity.assigned_to_id == user.id)
    elif role not in ("admin", "lider_sr"):
        query = query.where(
            (RecurringActivity.created_by_id == user.id) |
            (RecurringActivity.assigned_to_id == user.id)
        )
    # admin and lider_sr see everything

    query = query.order_by(RecurringActivity.priority.desc(), RecurringActivity.title)

    result = await db.execute(query)
    activities = result.scalars().all()

    today = date.today()
    groups = {
        "vencidas": [],
        "proximas_a_vencer": [],
        "en_proceso": [],
        "sin_iniciar": [],
        "completadas": [],
    }
    total = 0
    completed_total = 0

    # Map singular status (from compute_activity_status) to plural group keys
    STATUS_TO_GROUP = {
        "vencida": "vencidas",
        "proxima_a_vencer": "proximas_a_vencer",
        "en_proceso": "en_proceso",
        "sin_iniciar": "sin_iniciar",
        "completada": "completadas",
    }

    for a in activities:
        current_due = compute_current_due_date(a)
        current_inst = None
        if current_due:
            for inst in a.instances:
                if inst.due_date == current_due:
                    current_inst = inst
                    break

        data = _activity_to_dict(a, current_inst, list(a.instances))
        status = data["status"]
        total += 1
        if status == "completada":
            completed_total += 1
        group_key = STATUS_TO_GROUP.get(status, "sin_iniciar")
        groups[group_key].append(data)

    # Sort vencidas by days_overdue desc
    groups["vencidas"].sort(key=lambda x: x["days_overdue"], reverse=True)
    # Sort proximas by current_due_date asc
    groups["proximas_a_vencer"].sort(key=lambda x: x["current_due_date"] or "")

    cumplimiento = round(completed_total / total * 100, 1) if total > 0 else 0

    return {
        "kpis": {
            "total": total,
            "completadas": completed_total,
            "vencidas": len(groups["vencidas"]),
            "proximas_a_vencer": len(groups["proximas_a_vencer"]),
            "en_proceso": len(groups["en_proceso"]),
            "sin_iniciar": len(groups["sin_iniciar"]),
            "cumplimiento_pct": cumplimiento,
            "escaladas": sum(1 for a in groups["vencidas"] if a["escalated"]),
        },
        "vencidas": groups["vencidas"],
        "proximas_a_vencer": groups["proximas_a_vencer"],
        "en_proceso": groups["en_proceso"],
        "sin_iniciar": groups["sin_iniciar"],
        "completadas": groups["completadas"],
    }


# ─── Log (history) ────────────────────────────────────────────────────────────

@router.get("/{activity_id}/log")
async def activity_log(activity_id: int, db: DB, user: CurrentUser, limit: int = 30):
    """Full compliance log for an activity (most recent first)."""
    result = await db.execute(
        select(RecurringActivity)
        .options(
            selectinload(RecurringActivity.assigned_to).selectinload(User.main_business),
            selectinload(RecurringActivity.escalate_to).selectinload(User.main_business),
        )
        .where(RecurringActivity.id == activity_id)
    )
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    instances_result = await db.execute(
        select(ActivityInstance)
        .options(selectinload(ActivityInstance.completed_by).selectinload(User.main_business))
        .where(ActivityInstance.activity_id == activity_id)
        .order_by(desc(ActivityInstance.due_date))
        .limit(limit)
    )
    instances = instances_result.scalars().all()

    return {
        "activity": {
            "id": a.id, "title": a.title, "frequency": a.frequency.value,
            "notify_channel": a.notify_channel,
            "notify_before_value": a.notify_before_value,
            "notify_before_unit": a.notify_before_unit,
            "escalate_after_hours": a.escalate_after_hours,
            "escalate_to": {"id": a.escalate_to.id, "full_name": a.escalate_to.full_name} if a.escalate_to else None,
        },
        "current_due_date": str(compute_current_due_date(a)),
        "next_due_date": str(compute_next_due_date(a)),
        "streak": _streak(instances),
        "compliance_rate": round(
            sum(1 for i in instances if i.status == ActivityStatus.COMPLETADA) / max(len(instances), 1) * 100, 1
        ),
        "log": [
            {
                "id": i.id,
                "due_date": str(i.due_date),
                "status": i.status.value,
                "completed_date": str(i.completed_date) if i.completed_date else None,
                "completed_by": i.completed_by.full_name if i.completed_by else None,
                "notes": i.notes,
                "escalation_sent": i.escalation_sent_at is not None,
            }
            for i in instances
        ],
    }


# ─── Legacy instance update (kept for compat) ────────────────────────────────

@router.patch("/instances/{instance_id}")
async def update_instance(instance_id: int, payload: dict, db: DB, user: CurrentUser):
    result = await db.execute(select(ActivityInstance).where(ActivityInstance.id == instance_id))
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Instancia no encontrada")
    if payload.get("status") == "completada":
        inst.status = ActivityStatus.COMPLETADA
        inst.completed_date = date.today()
        inst.completed_by_id = user.id
    elif payload.get("status") == "en_proceso":
        inst.status = ActivityStatus.EN_PROCESO
    if payload.get("notes"):
        inst.notes = payload["notes"]
    await db.flush()
    return {"id": inst.id, "status": inst.status.value}
