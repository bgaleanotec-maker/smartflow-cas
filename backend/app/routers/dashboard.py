from datetime import date, timedelta
from collections import defaultdict

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

ACTIVE_INSTANCE_STATES = ("sin_iniciar", "en_proceso", "vencida", "proxima_a_vencer")


@router.get("/attention")
async def get_attention_items(db: DB, current_user: CurrentUser):
    from app.models.epic import Story, StoryStatus, StoryUpdate

    today = date.today()
    threshold = today + timedelta(days=3)

    opts = [
        selectinload(Story.assigned_to),
        selectinload(Story.epic),
        selectinload(Story.updates).selectinload(StoryUpdate.user),
    ]

    q = select(Story).options(*opts).where(
        (Story.is_blocking == True) |
        (Story.status == StoryStatus.bloqueada) |
        (
            (Story.status == StoryStatus.en_progreso) &
            (Story.due_date != None) &
            (Story.due_date <= threshold)
        )
    ).order_by(Story.is_blocking.desc(), Story.due_date)

    stories = (await db.execute(q)).scalars().all()

    by_project = defaultdict(list)
    for s in stories:
        pid = s.project_id or 0
        by_project[pid].append({
            "id": s.id,
            "title": s.title,
            "status": s.status,
            "is_blocking": s.is_blocking,
            "due_date": str(s.due_date) if s.due_date else None,
            "assigned_to": s.assigned_to.full_name if s.assigned_to else None,
            "epic_title": s.epic.title if s.epic else None,
            "last_update": s.updates[0].content[:100] if s.updates else None,
        })

    return [{"project_id": k, "stories": v} for k, v in by_project.items()]


# ─── Helpers de consolidación ────────────────────────────────────────────────

async def _collect_items(db, user_id: int | None = None):
    """Consolida los 3 orígenes de tareas en items uniformes.
    Si user_id se pasa, filtra a ese usuario; si no, trae todo (equipo)."""
    from app.models.activities import ActivityInstance, RecurringActivity
    from app.models.quick_task import QuickTask
    from app.models.task import Task
    from app.models.catalog import TaskStatus

    today = date.today()
    items = []       # pendientes (todas)
    done_today = []  # completadas hoy
    week_start = today - timedelta(days=today.weekday())

    # 1) Instancias de actividades recurrentes
    q = (
        select(ActivityInstance)
        .options(
            selectinload(ActivityInstance.activity).selectinload(RecurringActivity.assigned_to),
            selectinload(ActivityInstance.assigned_to),
        )
        .where(ActivityInstance.due_date >= today - timedelta(days=90))
    )
    instances = (await db.execute(q)).scalars().all()
    for inst in instances:
        owner = inst.assigned_to or (inst.activity.assigned_to if inst.activity else None)
        owner_id = owner.id if owner else None
        if user_id and owner_id != user_id:
            continue
        status = inst.status.value if hasattr(inst.status, "value") else str(inst.status)
        base = {
            "source": "recurrente",
            "id": inst.id,
            "title": inst.title,
            "due_date": str(inst.due_date) if inst.due_date else None,
            "owner_id": owner_id,
            "owner": owner.full_name if owner else "Sin asignar",
            "priority": inst.activity.priority if inst.activity else "media",
            "status": status,
            "link": "/torre-control",
        }
        if status in ("completada",):
            if inst.completed_date and inst.completed_date >= week_start:
                done_today.append({**base, "done_date": str(inst.completed_date)})
        elif status in ACTIVE_INSTANCE_STATES:
            days_overdue = (today - inst.due_date).days if inst.due_date and inst.due_date < today else 0
            items.append({**base, "days_overdue": days_overdue})

    # 2) Tareas rápidas
    q = select(QuickTask).options(
        selectinload(QuickTask.assigned_to), selectinload(QuickTask.user)
    )
    quick = (await db.execute(q)).scalars().all()
    for t in quick:
        owner = t.assigned_to or t.user
        owner_id = owner.id if owner else None
        if user_id and owner_id != user_id:
            continue
        base = {
            "source": "rapida",
            "id": t.id,
            "title": t.title,
            "due_date": str(t.due_date) if t.due_date else None,
            "owner_id": owner_id,
            "owner": owner.full_name if owner else "Sin asignar",
            "priority": t.priority or "media",
            "status": t.status or "pendiente",
            "link": "/quick-tasks",
        }
        if t.is_done:
            if t.done_at and t.done_at.date() >= week_start:
                done_today.append({**base, "done_date": str(t.done_at.date())})
        elif not t.will_not_deliver:
            days_overdue = (today - t.due_date).days if t.due_date and t.due_date < today else 0
            items.append({**base, "days_overdue": days_overdue})

    # 3) Tareas de proyecto
    q = (
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.status), selectinload(Task.project))
        .where(Task.is_deleted == False)  # noqa: E712
    )
    tasks = (await db.execute(q)).scalars().all()
    for t in tasks:
        owner = t.assignee
        owner_id = owner.id if owner else None
        if user_id and owner_id != user_id:
            continue
        is_done = bool(t.status and t.status.is_done_state)
        base = {
            "source": "proyecto",
            "id": t.id,
            "title": t.title,
            "project": t.project.name if t.project else None,
            "due_date": str(t.due_date) if t.due_date else None,
            "owner_id": owner_id,
            "owner": owner.full_name if owner else "Sin asignar",
            "priority": "media",
            "status": t.status.name if t.status else "Por Hacer",
            "link": f"/projects/{t.project_id}" if t.project_id else "/projects",
        }
        if is_done:
            if t.completed_at and t.completed_at.date() >= week_start:
                done_today.append({**base, "done_date": str(t.completed_at.date())})
        else:
            days_overdue = (today - t.due_date).days if t.due_date and t.due_date < today else 0
            items.append({**base, "days_overdue": days_overdue})

    return items, done_today


def _kpis(items, done_week, today):
    overdue = [i for i in items if i["days_overdue"] > 0]
    due_today = [i for i in items if i["due_date"] == str(today)]
    in_progress = [i for i in items if i["status"] in ("en_proceso", "en_progreso", "En Progreso")]
    done_today_list = [d for d in done_week if d.get("done_date") == str(today)]
    return {
        "total_pendientes": len(items),
        "vencidas": len(overdue),
        "vencen_hoy": len(due_today),
        "en_proceso": len(in_progress),
        "completadas_hoy": len(done_today_list),
        "completadas_semana": len(done_week),
    }


# ─── Dashboard gerencial (equipo completo) ───────────────────────────────────

@router.get("/gerencial")
async def dashboard_gerencial(db: DB, current_user: CurrentUser):
    """Tablero lean de gerenciamiento diario: estado consolidado del equipo."""
    from app.models.user import User

    today = date.today()
    items, done_week = await _collect_items(db)

    # Filas por persona (semáforo)
    users = (await db.execute(
        select(User).where(User.is_active == True)  # noqa: E712
    )).scalars().all()
    by_user = {}
    for u in users:
        by_user[u.id] = {
            "user_id": u.id,
            "name": u.full_name,
            "role": str(u.role.value if hasattr(u.role, "value") else u.role),
            "vencidas": 0, "hoy": 0, "en_proceso": 0, "pendientes": 0,
            "completadas_semana": 0,
        }
    unassigned = {"user_id": None, "name": "Sin asignar", "role": "",
                  "vencidas": 0, "hoy": 0, "en_proceso": 0, "pendientes": 0, "completadas_semana": 0}

    for i in items:
        row = by_user.get(i["owner_id"], unassigned)
        row["pendientes"] += 1
        if i["days_overdue"] > 0:
            row["vencidas"] += 1
        elif i["due_date"] == str(today):
            row["hoy"] += 1
        if i["status"] in ("en_proceso", "en_progreso", "En Progreso"):
            row["en_proceso"] += 1
    for d in done_week:
        row = by_user.get(d["owner_id"], unassigned)
        row["completadas_semana"] += 1

    team_rows = sorted(by_user.values(), key=lambda r: (-r["vencidas"], -r["hoy"], r["name"]))
    if unassigned["pendientes"] > 0:
        team_rows.append(unassigned)

    overdue_items = sorted(
        [i for i in items if i["days_overdue"] > 0],
        key=lambda i: -i["days_overdue"],
    )
    today_items = [i for i in items if i["due_date"] == str(today)]

    return {
        "date": str(today),
        "kpis": _kpis(items, done_week, today),
        "team": team_rows,
        "vencidas": overdue_items[:100],
        "hoy": today_items[:100],
    }


# ─── Mi espacio (personal) ───────────────────────────────────────────────────

@router.get("/mi-espacio")
async def mi_espacio(db: DB, current_user: CurrentUser):
    """Espacio personal: solo las tareas del usuario actual, ordenadas por urgencia."""
    today = date.today()
    items, done_week = await _collect_items(db, user_id=current_user.id)

    items_sorted = sorted(items, key=lambda i: (
        0 if i["days_overdue"] > 0 else (1 if i["due_date"] == str(today) else 2),
        -i["days_overdue"],
        i["due_date"] or "9999",
    ))

    return {
        "date": str(today),
        "user": current_user.full_name,
        "kpis": _kpis(items, done_week, today),
        "items": items_sorted,
        "completadas_semana": done_week,
    }


# ─── Gamificación ────────────────────────────────────────────────────────────
# XP calculado al vuelo desde el histórico de completadas (sin tablas nuevas):
#   rápida=10 · recurrente=15 · proyecto=20 · bonus prioridad alta=+5 · a tiempo=+5
# Nivel: umbrales crecientes con nombre (competencia percibida — SDT).
# Racha: días consecutivos con ≥1 tarea completada (fines de semana no rompen).

LEVELS = [
    (0, "Inicio", "🌱"),
    (100, "Constante", "⚡"),
    (300, "Productivo", "🚀"),
    (700, "Experto", "💎"),
    (1500, "Maestro", "🏆"),
    (3000, "Leyenda", "👑"),
]


def _level_for(xp: int):
    current = LEVELS[0]
    next_level = None
    for i, (threshold, name, icon) in enumerate(LEVELS):
        if xp >= threshold:
            current = (threshold, name, icon)
            next_level = LEVELS[i + 1] if i + 1 < len(LEVELS) else None
    level_num = LEVELS.index(current) + 1
    if next_level:
        span = next_level[0] - current[0]
        progress = round((xp - current[0]) / span * 100)
    else:
        progress = 100
    return {
        "level": level_num,
        "name": current[1],
        "icon": current[2],
        "xp": xp,
        "next_xp": next_level[0] if next_level else None,
        "next_name": next_level[1] if next_level else None,
        "progress_pct": min(100, max(0, progress)),
    }


def _streak_from_dates(dates_set, today):
    """Días consecutivos con ≥1 completada. Sábado/domingo no rompen la racha."""
    streak = 0
    day = today
    # si hoy no hay completadas todavía, la racha se cuenta desde ayer
    if day not in dates_set:
        day = day - timedelta(days=1)
    while True:
        if day in dates_set:
            streak += 1
            day = day - timedelta(days=1)
        elif day.weekday() >= 5:  # fin de semana no rompe
            day = day - timedelta(days=1)
        else:
            break
    return streak


async def _gamification_data(db):
    """Calcula XP, nivel, racha e insignias por usuario desde el histórico."""
    from app.models.activities import ActivityInstance
    from app.models.quick_task import QuickTask
    from app.models.task import Task
    from app.models.user import User

    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    stats = defaultdict(lambda: {
        "xp": 0, "total": 0, "week": 0, "on_time": 0,
        "dates": set(), "by_source": defaultdict(int),
    })

    # Recurrentes completadas
    q = select(ActivityInstance).options(
        selectinload(ActivityInstance.completed_by),
        selectinload(ActivityInstance.assigned_to),
        selectinload(ActivityInstance.activity),
    ).where(ActivityInstance.completed_date != None)  # noqa: E711
    for inst in (await db.execute(q)).scalars().all():
        owner = inst.completed_by or inst.assigned_to
        if not owner:
            continue
        s = stats[owner.id]
        xp = 15
        if inst.activity and getattr(inst.activity, "priority", None) in ("critica", "alta"):
            xp += 5
        if inst.due_date and inst.completed_date <= inst.due_date:
            xp += 5
            s["on_time"] += 1
        s["xp"] += xp
        s["total"] += 1
        s["dates"].add(inst.completed_date)
        s["by_source"]["recurrente"] += 1
        if inst.completed_date >= week_start:
            s["week"] += 1

    # Rápidas completadas
    q = select(QuickTask).options(
        selectinload(QuickTask.assigned_to), selectinload(QuickTask.user)
    ).where(QuickTask.is_done == True)  # noqa: E712
    for t in (await db.execute(q)).scalars().all():
        owner = t.assigned_to or t.user
        if not owner or not t.done_at:
            continue
        s = stats[owner.id]
        done_d = t.done_at.date()
        xp = 10
        if t.priority in ("urgente", "alta"):
            xp += 5
        if t.due_date and done_d <= t.due_date:
            xp += 5
            s["on_time"] += 1
        s["xp"] += xp
        s["total"] += 1
        s["dates"].add(done_d)
        s["by_source"]["rapida"] += 1
        if done_d >= week_start:
            s["week"] += 1

    # Proyecto completadas
    q = select(Task).options(selectinload(Task.assignee)).where(
        Task.completed_at != None  # noqa: E711
    )
    for t in (await db.execute(q)).scalars().all():
        if not t.assignee:
            continue
        s = stats[t.assignee.id]
        done_d = t.completed_at.date()
        xp = 20
        if t.due_date and done_d <= t.due_date:
            xp += 5
            s["on_time"] += 1
        s["xp"] += xp
        s["total"] += 1
        s["dates"].add(done_d)
        s["by_source"]["proyecto"] += 1
        if done_d >= week_start:
            s["week"] += 1

    users = (await db.execute(
        select(User).where(User.is_active == True)  # noqa: E712
    )).scalars().all()

    result = {}
    for u in users:
        s = stats.get(u.id)
        if not s:
            result[u.id] = {
                "user_id": u.id, "name": u.full_name,
                "level": _level_for(0), "streak": 0, "week": 0,
                "total": 0, "badges": [],
            }
            continue
        streak = _streak_from_dates(s["dates"], today)
        badges = []
        if streak >= 3:
            badges.append({"id": "racha3", "icon": "🔥", "name": f"Racha de {streak} días"})
        if streak >= 10:
            badges.append({"id": "racha10", "icon": "🌋", "name": "Imparable (10+ días)"})
        if s["week"] >= 10:
            badges.append({"id": "semana10", "icon": "⚡", "name": "10+ esta semana"})
        if s["total"] >= 50:
            badges.append({"id": "total50", "icon": "💪", "name": "50 tareas completadas"})
        if s["total"] >= 200:
            badges.append({"id": "total200", "icon": "🏔️", "name": "200 tareas completadas"})
        if s["on_time"] >= 20:
            badges.append({"id": "puntual", "icon": "🎯", "name": "Puntualidad (20+ a tiempo)"})
        result[u.id] = {
            "user_id": u.id, "name": u.full_name,
            "level": _level_for(s["xp"]),
            "streak": streak,
            "week": s["week"],
            "total": s["total"],
            "on_time": s["on_time"],
            "by_source": dict(s["by_source"]),
            "badges": badges,
        }
    return result


@router.get("/gamification")
async def gamification(db: DB, current_user: CurrentUser):
    """Perfil de gamificación propio + ranking semanal del equipo."""
    data = await _gamification_data(db)
    me = data.get(current_user.id) or {
        "user_id": current_user.id, "name": current_user.full_name,
        "level": _level_for(0), "streak": 0, "week": 0, "total": 0, "badges": [],
    }
    ranking = sorted(data.values(), key=lambda r: (-r["week"], -r["level"]["xp"]))
    podium = [
        {**r, "medal": ["🥇", "🥈", "🥉"][i] if i < 3 else None}
        for i, r in enumerate(ranking)
    ]
    return {"me": me, "ranking": podium}
