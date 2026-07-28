"""Retos gamificados (tipo hackathon) + estadísticas de uso de la app."""
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from collections import defaultdict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser, AdminUser
from app.models.challenge import Challenge, UsageEvent

router = APIRouter(prefix="/challenges", tags=["Retos y Uso"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ChallengeCreate(BaseModel):
    title: str
    description: Optional[str] = None
    prize: Optional[str] = None
    emoji: str = "🏆"
    metric: str = "tareas_completadas"
    start_date: date
    end_date: date


class ChallengeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    prize: Optional[str] = None
    emoji: Optional[str] = None
    metric: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None
    winner_id: Optional[int] = None


def _serialize(c: Challenge) -> dict:
    today = date.today()
    if not c.is_active:
        status = "pausado"
    elif today < c.start_date:
        status = "proximo"
    elif today > c.end_date:
        status = "finalizado"
    else:
        status = "en_curso"
    days_left = (c.end_date - today).days if status == "en_curso" else None
    return {
        "id": c.id,
        "title": c.title,
        "description": c.description,
        "prize": c.prize,
        "emoji": c.emoji,
        "metric": c.metric,
        "start_date": str(c.start_date),
        "end_date": str(c.end_date),
        "is_active": c.is_active,
        "status": status,
        "days_left": days_left,
        "winner": c.winner.full_name if c.winner else None,
        "created_by": c.created_by.full_name if c.created_by else None,
    }


_OPTS = [selectinload(Challenge.created_by), selectinload(Challenge.winner)]


# ─── Leaderboard: completadas por usuario en el rango del reto ───────────────

async def _challenge_scores(db, start: date, end: date) -> list:
    from app.models.activities import ActivityInstance
    from app.models.quick_task import QuickTask
    from app.models.task import Task
    from app.models.user import User

    scores = defaultdict(lambda: {"completadas": 0, "a_tiempo": 0})

    q = select(ActivityInstance).options(
        selectinload(ActivityInstance.completed_by),
        selectinload(ActivityInstance.assigned_to),
    ).where(
        ActivityInstance.completed_date >= start,
        ActivityInstance.completed_date <= end,
    )
    for inst in (await db.execute(q)).scalars().all():
        owner = inst.completed_by or inst.assigned_to
        if not owner:
            continue
        scores[owner.id]["completadas"] += 1
        if inst.due_date and inst.completed_date <= inst.due_date:
            scores[owner.id]["a_tiempo"] += 1

    q = select(QuickTask).options(
        selectinload(QuickTask.assigned_to), selectinload(QuickTask.user)
    ).where(QuickTask.is_done == True)  # noqa: E712
    for t in (await db.execute(q)).scalars().all():
        if not t.done_at:
            continue
        d = t.done_at.date()
        if d < start or d > end:
            continue
        owner = t.assigned_to or t.user
        if not owner:
            continue
        scores[owner.id]["completadas"] += 1
        if t.due_date and d <= t.due_date:
            scores[owner.id]["a_tiempo"] += 1

    q = select(Task).options(selectinload(Task.assignee)).where(
        Task.completed_at != None  # noqa: E711
    )
    for t in (await db.execute(q)).scalars().all():
        if not t.assignee:
            continue
        d = t.completed_at.date()
        if d < start or d > end:
            continue
        scores[t.assignee.id]["completadas"] += 1
        if t.due_date and d <= t.due_date:
            scores[t.assignee.id]["a_tiempo"] += 1

    users = {u.id: u.full_name for u in (await db.execute(
        select(User).where(User.is_active == True)  # noqa: E712
    )).scalars().all()}

    rows = [
        {"user_id": uid, "name": users.get(uid, "—"), **s}
        for uid, s in scores.items() if uid in users
    ]
    rows.sort(key=lambda r: (-r["completadas"], -r["a_tiempo"]))
    for i, r in enumerate(rows):
        r["position"] = i + 1
        r["medal"] = ["🥇", "🥈", "🥉"][i] if i < 3 else None
    return rows


# ─── Endpoints Retos ─────────────────────────────────────────────────────────

@router.get("")
async def list_challenges(db: DB, current_user: CurrentUser, all: bool = False):
    q = select(Challenge).options(*_OPTS).order_by(Challenge.end_date.desc())
    if not all:
        q = q.where(Challenge.is_active == True)  # noqa: E712
    challenges = (await db.execute(q)).scalars().all()
    return [_serialize(c) for c in challenges]


@router.post("", status_code=201)
async def create_challenge(payload: ChallengeCreate, db: DB, admin: AdminUser):
    if payload.end_date < payload.start_date:
        raise HTTPException(400, "La fecha fin debe ser posterior al inicio")
    c = Challenge(**payload.model_dump(), created_by_id=admin.id)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    result = await db.execute(select(Challenge).options(*_OPTS).where(Challenge.id == c.id))
    return _serialize(result.scalar_one())


@router.get("/{challenge_id}")
async def get_challenge(challenge_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(select(Challenge).options(*_OPTS).where(Challenge.id == challenge_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Reto no encontrado")
    data = _serialize(c)
    data["leaderboard"] = await _challenge_scores(db, c.start_date, min(c.end_date, date.today()))
    return data


@router.patch("/{challenge_id}")
async def update_challenge(challenge_id: int, payload: ChallengeUpdate, db: DB, admin: AdminUser):
    result = await db.execute(select(Challenge).options(*_OPTS).where(Challenge.id == challenge_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Reto no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(c, field, value)
    await db.commit()
    await db.refresh(c)
    return _serialize(c)


@router.delete("/{challenge_id}")
async def delete_challenge(challenge_id: int, db: DB, admin: AdminUser):
    result = await db.execute(select(Challenge).where(Challenge.id == challenge_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Reto no encontrado")
    await db.delete(c)
    await db.commit()
    return {"ok": True}


# ─── Tracking de uso ─────────────────────────────────────────────────────────

class TrackEvent(BaseModel):
    event_type: str = "page_view"
    path: Optional[str] = None


@router.post("/usage/track", status_code=204)
async def track_usage(payload: TrackEvent, db: DB, current_user: CurrentUser):
    db.add(UsageEvent(
        user_id=current_user.id,
        event_type=payload.event_type[:30],
        path=(payload.path or "")[:200] or None,
    ))
    await db.commit()


@router.get("/usage/stats")
async def usage_stats(db: DB, current_user: CurrentUser):
    """Estadísticas de uso de la app (últimos 30 días). Solo visión global."""
    role = str(current_user.role.value if hasattr(current_user.role, "value") else current_user.role)
    if role not in ("admin", "leader", "lider_sr", "directivo"):
        from fastapi import HTTPException
        raise HTTPException(403, "Solo líderes, SR o administradores")
    now = datetime.now(timezone.utc)
    since_30 = now - timedelta(days=30)
    since_7 = now - timedelta(days=7)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Usuarios activos
    active_today = (await db.execute(
        select(sa_func.count(sa_func.distinct(UsageEvent.user_id)))
        .where(UsageEvent.created_at >= today_start)
    )).scalar() or 0
    active_week = (await db.execute(
        select(sa_func.count(sa_func.distinct(UsageEvent.user_id)))
        .where(UsageEvent.created_at >= since_7)
    )).scalar() or 0

    # Páginas más usadas (30 días)
    top_pages_rows = (await db.execute(
        select(UsageEvent.path, sa_func.count(UsageEvent.id).label("hits"))
        .where(UsageEvent.created_at >= since_30, UsageEvent.path != None)  # noqa: E711
        .group_by(UsageEvent.path)
        .order_by(sa_func.count(UsageEvent.id).desc())
        .limit(10)
    )).all()

    # Usuarios más activos (30 días)
    from app.models.user import User
    top_users_rows = (await db.execute(
        select(UsageEvent.user_id, sa_func.count(UsageEvent.id).label("hits"))
        .where(UsageEvent.created_at >= since_30)
        .group_by(UsageEvent.user_id)
        .order_by(sa_func.count(UsageEvent.id).desc())
        .limit(10)
    )).all()
    user_names = {u.id: u.full_name for u in (await db.execute(select(User))).scalars().all()}

    # Actividad por día (14 días) — para gráfico
    since_14 = now - timedelta(days=14)
    daily_rows = (await db.execute(
        select(
            sa_func.date(UsageEvent.created_at).label("day"),
            sa_func.count(UsageEvent.id),
            sa_func.count(sa_func.distinct(UsageEvent.user_id)),
        )
        .where(UsageEvent.created_at >= since_14)
        .group_by(sa_func.date(UsageEvent.created_at))
        .order_by(sa_func.date(UsageEvent.created_at))
    )).all()

    return {
        "active_today": active_today,
        "active_week": active_week,
        "top_pages": [{"path": p, "hits": h} for p, h in top_pages_rows],
        "top_users": [
            {"name": user_names.get(uid, "—"), "hits": h} for uid, h in top_users_rows
        ],
        "daily": [
            {"day": str(d), "events": e, "users": u} for d, e, u in daily_rows
        ],
    }
