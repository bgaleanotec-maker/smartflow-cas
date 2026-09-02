"""Cronograma — fechas clave visibles para todo el equipo.
Todos ven; líderes/SR/admin administran."""
import calendar
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser, LeaderOrAdmin
from app.models.key_date import KeyDate

router = APIRouter(prefix="/cronograma", tags=["Cronograma"])


RECURRENCES = ("puntual", "semanal", "quincenal", "mensual", "bimestral", "trimestral", "semestral", "anual")


class KeyDateCreate(BaseModel):
    title: str
    description: Optional[str] = None
    date: date
    time: Optional[str] = None
    category: str = "otro"
    emoji: str = "📌"
    recurrence: str = "puntual"
    repeat_monthly: bool = False   # legado
    business_id: Optional[int] = None


class KeyDateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[date] = None
    time: Optional[str] = None
    category: Optional[str] = None
    emoji: Optional[str] = None
    recurrence: Optional[str] = None
    business_id: Optional[int] = None
    is_active: Optional[bool] = None


def _add_months(base: date, day: int, months_ahead: int) -> date:
    y = base.year + (base.month - 1 + months_ahead) // 12
    m = (base.month - 1 + months_ahead) % 12 + 1
    return date(y, m, min(day, calendar.monthrange(y, m)[1]))


def _next_occurrence(base: date, today: date, recurrence: str) -> date:
    """Próxima ocurrencia según la frecuencia. Puntual: la fecha tal cual."""
    if recurrence in ("puntual", None, "") or base >= today:
        return base

    if recurrence in ("semanal", "quincenal"):
        step = 7 if recurrence == "semanal" else 14
        diff = (today - base).days
        k = (diff + step - 1) // step
        return base + timedelta(days=k * step)

    month_steps = {"mensual": 1, "bimestral": 2, "trimestral": 3, "semestral": 6, "anual": 12}
    step = month_steps.get(recurrence)
    if not step:
        return base
    for i in range(0, 400, step):
        candidate = _add_months(base, base.day, i)
        if candidate >= today:
            return candidate
    return base


def _serialize(k: KeyDate, today: date) -> dict:
    # compat: filas viejas con repeat_monthly sin recurrence
    recurrence = k.recurrence or ("mensual" if k.repeat_monthly else "puntual")
    effective = _next_occurrence(k.date, today, recurrence)
    days_left = (effective - today).days
    return {
        "id": k.id,
        "title": k.title,
        "description": k.description,
        "date": str(effective),
        "original_date": str(k.date),
        "time": k.time,
        "category": k.category,
        "emoji": k.emoji,
        "recurrence": recurrence,
        "repeat_monthly": recurrence == "mensual",
        "business": k.business.name if k.business else None,
        "business_color": k.business.color if k.business else None,
        "business_id": k.business_id,
        "created_by": k.created_by.full_name if k.created_by else None,
        "days_left": days_left,
        "is_today": days_left == 0,
        "is_past": days_left < 0,
    }


@router.get("")
async def list_key_dates(db: DB, current_user: CurrentUser, include_past: bool = False):
    """Cronograma visible para TODO el equipo, ordenado por próxima fecha."""
    today = date.today()
    rows = (await db.execute(
        select(KeyDate)
        .options(selectinload(KeyDate.business), selectinload(KeyDate.created_by))
        .where(KeyDate.is_active == True)  # noqa: E712
    )).scalars().all()

    items = [_serialize(k, today) for k in rows]
    if not include_past:
        # mostrar pasados solo de los últimos 7 días (contexto reciente)
        items = [i for i in items if i["days_left"] >= -7]
    items.sort(key=lambda i: i["date"])
    return items


@router.post("", status_code=201)
async def create_key_date(payload: KeyDateCreate, db: DB, admin: LeaderOrAdmin):
    data = payload.model_dump()
    if data.get("repeat_monthly") and data.get("recurrence") == "puntual":
        data["recurrence"] = "mensual"   # compat con clientes viejos
    if data.get("recurrence") not in RECURRENCES:
        raise HTTPException(400, f"Recurrencia inválida. Opciones: {', '.join(RECURRENCES)}")
    data["repeat_monthly"] = data["recurrence"] == "mensual"
    k = KeyDate(**data, created_by_id=admin.id)
    db.add(k)
    await db.commit()
    await db.refresh(k)
    row = (await db.execute(
        select(KeyDate).options(selectinload(KeyDate.business), selectinload(KeyDate.created_by))
        .where(KeyDate.id == k.id)
    )).scalar_one()
    return _serialize(row, date.today())


@router.patch("/{key_date_id}")
async def update_key_date(key_date_id: int, payload: KeyDateUpdate, db: DB, admin: LeaderOrAdmin):
    k = (await db.execute(
        select(KeyDate).options(selectinload(KeyDate.business), selectinload(KeyDate.created_by))
        .where(KeyDate.id == key_date_id)
    )).scalar_one_or_none()
    if not k:
        raise HTTPException(404, "Fecha no encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(k, field, value)
    await db.commit()
    await db.refresh(k)
    return _serialize(k, date.today())


@router.delete("/{key_date_id}")
async def delete_key_date(key_date_id: int, db: DB, admin: LeaderOrAdmin):
    k = (await db.execute(select(KeyDate).where(KeyDate.id == key_date_id))).scalar_one_or_none()
    if not k:
        raise HTTPException(404, "Fecha no encontrada")
    await db.delete(k)
    await db.commit()
    return {"ok": True}
