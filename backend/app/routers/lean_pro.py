from typing import Optional, List
from datetime import date, datetime, timedelta
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, func, and_, extract
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.deps import DB, CurrentUser
from app.models.lean_pro import DailyStandup, Retrospective, SprintMetrics, KaizenItem
from app.models.user import User
from app.models.project import Sprint
from app.models.task import Task

router = APIRouter(prefix="/lean-pro", tags=["Lean Pro - Agile & Gerenciamiento Diario"])


# ─── Daily Standup ───────────────────────────────────────────────────────────

class StandupCreate(BaseModel):
    what_did: Optional[str] = None
    what_will: Optional[str] = None
    blockers: Optional[str] = None
    mood: Optional[str] = None
    energy_level: Optional[int] = None
    project_id: Optional[int] = None
    scope: str = "TODOS"


@router.post("/standup", status_code=201)
async def create_standup(payload: StandupCreate, db: DB, user: CurrentUser):
    today = date.today()
    existing = await db.execute(
        select(DailyStandup).where(DailyStandup.user_id == user.id, DailyStandup.standup_date == today)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya registraste tu standup de hoy")

    standup = DailyStandup(user_id=user.id, standup_date=today, **payload.model_dump())
    db.add(standup)
    await db.flush()
    return {"id": standup.id}


@router.get("/standup")
async def list_standups(
    db: DB, user: CurrentUser,
    standup_date: Optional[date] = None, scope: Optional[str] = None,
    skip: int = 0, limit: int = 50,
):
    query = select(DailyStandup).options(selectinload(DailyStandup.user).selectinload(User.main_business))
    if standup_date:
        query = query.where(DailyStandup.standup_date == standup_date)
    else:
        query = query.where(DailyStandup.standup_date == date.today())
    if scope:
        query = query.where(DailyStandup.scope == scope)
    query = query.order_by(DailyStandup.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return [{
        "id": s.id, "standup_date": str(s.standup_date),
        "what_did": s.what_did, "what_will": s.what_will, "blockers": s.blockers,
        "mood": s.mood, "energy_level": s.energy_level, "scope": s.scope,
        "user": {"id": s.user.id, "full_name": s.user.full_name, "role": s.user.role.value} if s.user else None,
        "created_at": s.created_at,
    } for s in result.scalars().all()]


@router.get("/standup/my")
async def my_standup_today(db: DB, user: CurrentUser):
    result = await db.execute(
        select(DailyStandup).where(DailyStandup.user_id == user.id, DailyStandup.standup_date == date.today())
    )
    s = result.scalar_one_or_none()
    if not s:
        return {"submitted": False}
    return {"submitted": True, "what_did": s.what_did, "what_will": s.what_will, "blockers": s.blockers, "mood": s.mood}


# ─── Retrospectives ──────────────────────────────────────────────────────────

class RetroCreate(BaseModel):
    title: str
    retro_date: date
    sprint_id: Optional[int] = None
    project_id: Optional[int] = None
    scope: str = "TODOS"
    went_well: Optional[str] = None
    to_improve: Optional[str] = None
    action_items: Optional[str] = None
    kudos: Optional[str] = None
    attendees: Optional[str] = None
    notes: Optional[str] = None


@router.post("/retro", status_code=201)
async def create_retro(payload: RetroCreate, db: DB, user: CurrentUser):
    retro = Retrospective(facilitator_id=user.id, **payload.model_dump())
    db.add(retro)
    await db.flush()
    return {"id": retro.id}


@router.get("/retro")
async def list_retros(db: DB, user: CurrentUser, scope: Optional[str] = None, limit: int = 20):
    query = select(Retrospective).options(selectinload(Retrospective.facilitator).selectinload(User.main_business))
    if scope:
        query = query.where(Retrospective.scope == scope)
    query = query.order_by(Retrospective.retro_date.desc()).limit(limit)
    result = await db.execute(query)
    return [{
        "id": r.id, "title": r.title, "retro_date": str(r.retro_date),
        "scope": r.scope, "sprint_id": r.sprint_id, "project_id": r.project_id,
        "went_well": r.went_well, "to_improve": r.to_improve,
        "action_items": r.action_items, "kudos": r.kudos,
        "attendees": r.attendees, "notes": r.notes,
        "facilitator": {"id": r.facilitator.id, "full_name": r.facilitator.full_name} if r.facilitator else None,
    } for r in result.scalars().all()]


# ─── Kaizen (Continuous Improvement) ─────────────────────────────────────────

class KaizenCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "proceso"
    impact: str = "medio"
    effort: str = "medio"
    scope: str = "TODOS"


class KaizenUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assigned_to_id: Optional[int] = None
    result: Optional[str] = None


@router.post("/kaizen", status_code=201)
async def create_kaizen(payload: KaizenCreate, db: DB, user: CurrentUser):
    item = KaizenItem(proposed_by_id=user.id, **payload.model_dump())
    db.add(item)
    await db.flush()
    return {"id": item.id}


@router.get("/kaizen")
async def list_kaizen(db: DB, user: CurrentUser, status: Optional[str] = None, scope: Optional[str] = None):
    query = select(KaizenItem).options(
        selectinload(KaizenItem.proposed_by).selectinload(User.main_business),
        selectinload(KaizenItem.assigned_to).selectinload(User.main_business)
    )
    if status:
        query = query.where(KaizenItem.status == status)
    if scope:
        query = query.where(KaizenItem.scope == scope)
    query = query.order_by(KaizenItem.created_at.desc())
    result = await db.execute(query)
    return [{
        "id": k.id, "title": k.title, "description": k.description,
        "category": k.category, "impact": k.impact, "effort": k.effort,
        "status": k.status, "scope": k.scope, "result": k.result,
        "proposed_by": {"id": k.proposed_by.id, "full_name": k.proposed_by.full_name} if k.proposed_by else None,
        "assigned_to": {"id": k.assigned_to.id, "full_name": k.assigned_to.full_name} if k.assigned_to else None,
        "created_at": k.created_at,
    } for k in result.scalars().all()]


@router.patch("/kaizen/{item_id}")
async def update_kaizen(item_id: int, payload: KaizenUpdate, db: DB, user: CurrentUser):
    result = await db.execute(select(KaizenItem).where(KaizenItem.id == item_id))
    k = result.scalar_one_or_none()
    if not k:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(k, field, value)
    await db.flush()
    return {"id": k.id}


# ─── Lean Pro Dashboard ──────────────────────────────────────────────────────

@router.get("/dashboard")
async def lean_dashboard(db: DB, user: CurrentUser, scope: Optional[str] = None):
    """Dashboard completo de Lean Pro - metricas agiles y gerenciamiento."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    # Standups today
    standups_today = (await db.execute(
        select(func.count(DailyStandup.id)).where(DailyStandup.standup_date == today)
    )).scalar()

    # Standups this week
    standups_week = (await db.execute(
        select(func.count(DailyStandup.id)).where(DailyStandup.standup_date >= week_start)
    )).scalar()

    # Blockers count
    blockers = await db.execute(
        select(DailyStandup).where(
            DailyStandup.standup_date == today,
            DailyStandup.blockers != None,
            DailyStandup.blockers != '',
        ).options(selectinload(DailyStandup.user).selectinload(User.main_business))
    )
    blocker_list = [{
        "user": s.user.full_name if s.user else "?",
        "blocker": s.blockers,
    } for s in blockers.scalars().all()]

    # Team mood average
    moods = await db.execute(
        select(DailyStandup.energy_level).where(
            DailyStandup.standup_date == today, DailyStandup.energy_level != None
        )
    )
    energy_vals = [r[0] for r in moods if r[0]]
    avg_energy = round(sum(energy_vals) / len(energy_vals), 1) if energy_vals else 0

    # Kaizen stats
    kaizen_total = (await db.execute(select(func.count(KaizenItem.id)))).scalar()
    kaizen_implemented = (await db.execute(
        select(func.count(KaizenItem.id)).where(KaizenItem.status == "implementado")
    )).scalar()
    kaizen_pending = (await db.execute(
        select(func.count(KaizenItem.id)).where(KaizenItem.status.in_(["propuesto", "aprobado", "en_progreso"]))
    )).scalar()

    # Retro count
    retro_count = (await db.execute(select(func.count(Retrospective.id)))).scalar()

    # Velocity (last 5 sprints if available)
    velocity_data = await db.execute(
        select(SprintMetrics).order_by(SprintMetrics.calculated_at.desc()).limit(5)
    )
    velocity = [{
        "sprint_id": m.sprint_id, "planned": m.planned_points,
        "completed": m.completed_points, "tasks_done": m.completed_tasks,
    } for m in velocity_data.scalars().all()]

    return {
        "standup": {
            "today_count": standups_today,
            "week_count": standups_week,
            "avg_energy": avg_energy,
            "blockers": blocker_list,
        },
        "kaizen": {
            "total": kaizen_total,
            "implemented": kaizen_implemented,
            "pending": kaizen_pending,
            "implementation_rate": round((kaizen_implemented / max(kaizen_total, 1)) * 100, 1),
        },
        "retro_count": retro_count,
        "velocity": velocity,
    }
