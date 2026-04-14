from typing import Optional
from datetime import date
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, func, extract
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.deps import DB, CurrentUser
from app.models.business_intel import HechoRelevante
from app.models.user import User

router = APIRouter(prefix="/hechos", tags=["Hechos Relevantes"])


class HechoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "comercial"
    impact_level: str = "medio"
    week_number: int
    year: int
    week_start: Optional[date] = None
    week_end: Optional[date] = None
    business_id: Optional[int] = None
    action_required: Optional[str] = None
    responsible_name: Optional[str] = None
    tags: Optional[str] = None


class HechoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    impact_level: Optional[str] = None
    action_required: Optional[str] = None
    responsible_name: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[str] = None


@router.post("", status_code=201)
async def create_hecho(payload: HechoCreate, db: DB, user: CurrentUser):
    hecho = HechoRelevante(created_by_id=user.id, **payload.model_dump())
    db.add(hecho)
    await db.flush()
    await db.refresh(hecho)
    return {"id": hecho.id}


@router.get("")
async def list_hechos(
    db: DB, user: CurrentUser,
    week: Optional[int] = None, year: Optional[int] = None,
    category: Optional[str] = None, status: Optional[str] = None,
    skip: int = 0, limit: int = 50,
):
    query = (
        select(HechoRelevante)
        .where(HechoRelevante.is_deleted == False)
        .options(selectinload(HechoRelevante.created_by).selectinload(User.main_business), selectinload(HechoRelevante.business))
    )
    if week:
        query = query.where(HechoRelevante.week_number == week)
    if year:
        query = query.where(HechoRelevante.year == year)
    if category:
        query = query.where(HechoRelevante.category == category)
    if status:
        query = query.where(HechoRelevante.status == status)

    query = query.order_by(HechoRelevante.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    hechos = result.scalars().all()

    return [{
        "id": h.id, "title": h.title, "description": h.description,
        "category": h.category, "impact_level": h.impact_level,
        "week_number": h.week_number, "year": h.year,
        "week_start": str(h.week_start) if h.week_start else None,
        "week_end": str(h.week_end) if h.week_end else None,
        "action_required": h.action_required,
        "responsible_name": h.responsible_name,
        "status": h.status, "tags": h.tags,
        "created_by": {"id": h.created_by.id, "full_name": h.created_by.full_name} if h.created_by else None,
        "business": {"id": h.business.id, "name": h.business.name} if h.business else None,
        "created_at": h.created_at,
    } for h in hechos]


@router.get("/{hecho_id}")
async def get_hecho(hecho_id: int, db: DB, user: CurrentUser):
    result = await db.execute(
        select(HechoRelevante)
        .where(HechoRelevante.id == hecho_id, HechoRelevante.is_deleted == False)
        .options(selectinload(HechoRelevante.created_by).selectinload(User.main_business), selectinload(HechoRelevante.business))
    )
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Hecho no encontrado")
    return {
        "id": h.id, "title": h.title, "description": h.description,
        "category": h.category, "impact_level": h.impact_level,
        "week_number": h.week_number, "year": h.year,
        "week_start": str(h.week_start) if h.week_start else None,
        "week_end": str(h.week_end) if h.week_end else None,
        "action_required": h.action_required, "responsible_name": h.responsible_name,
        "status": h.status, "tags": h.tags,
        "created_by": {"id": h.created_by.id, "full_name": h.created_by.full_name} if h.created_by else None,
        "business": {"id": h.business.id, "name": h.business.name} if h.business else None,
        "created_at": h.created_at, "updated_at": h.updated_at,
    }


@router.patch("/{hecho_id}")
async def update_hecho(hecho_id: int, payload: HechoUpdate, db: DB, user: CurrentUser):
    result = await db.execute(select(HechoRelevante).where(HechoRelevante.id == hecho_id, HechoRelevante.is_deleted == False))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Hecho no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(h, field, value)
    await db.flush()
    return {"id": h.id}


@router.delete("/{hecho_id}", status_code=204)
async def delete_hecho(hecho_id: int, db: DB, user: CurrentUser):
    result = await db.execute(select(HechoRelevante).where(HechoRelevante.id == hecho_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Hecho no encontrado")
    h.is_deleted = True
    await db.flush()


@router.get("/dashboard/stats")
async def hechos_dashboard(db: DB, user: CurrentUser):
    total = (await db.execute(select(func.count(HechoRelevante.id)).where(HechoRelevante.is_deleted == False))).scalar()
    by_category = await db.execute(
        select(HechoRelevante.category, func.count(HechoRelevante.id))
        .where(HechoRelevante.is_deleted == False)
        .group_by(HechoRelevante.category)
    )
    by_impact = await db.execute(
        select(HechoRelevante.impact_level, func.count(HechoRelevante.id))
        .where(HechoRelevante.is_deleted == False)
        .group_by(HechoRelevante.impact_level)
    )
    return {
        "total": total,
        "by_category": {r[0]: r[1] for r in by_category},
        "by_impact": {r[0]: r[1] for r in by_impact},
    }
