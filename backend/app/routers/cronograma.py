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


class KeyDateCreate(BaseModel):
    title: str
    description: Optional[str] = None
    date: date
    time: Optional[str] = None
    category: str = "otro"
    emoji: str = "📌"
    repeat_monthly: bool = False
    business_id: Optional[int] = None


class KeyDateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[date] = None
    time: Optional[str] = None
    category: Optional[str] = None
    emoji: Optional[str] = None
    repeat_monthly: Optional[bool] = None
    business_id: Optional[int] = None
    is_active: Optional[bool] = None


def _next_occurrence(base: date, today: date) -> date:
    """Para eventos mensuales: la próxima ocurrencia del mismo día del mes."""
    day = base.day
    y, m = today.year, today.month
    for _ in range(24):
        last = calendar.monthrange(y, m)[1]
        candidate = date(y, m, min(day, last))
        if candidate >= today:
            return candidate
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return base


def _serialize(k: KeyDate, today: date) -> dict:
    effective = _next_occurrence(k.date, today) if k.repeat_monthly else k.date
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
        "repeat_monthly": k.repeat_monthly,
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
    k = KeyDate(**payload.model_dump(), created_by_id=admin.id)
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
