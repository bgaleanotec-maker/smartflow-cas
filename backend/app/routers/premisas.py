from typing import Optional
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.deps import DB, CurrentUser
from app.models.business_intel import PremisaNegocio, PremisaTimeline, PremisaStatus
from app.models.user import User

router = APIRouter(prefix="/premisas", tags=["Premisas de Negocio"])


class PremisaCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "presupuesto"
    budget_year: int
    budget_line: Optional[str] = None
    estimated_amount: Optional[Decimal] = None
    assumption_basis: Optional[str] = None
    risk_if_wrong: Optional[str] = None
    review_date: Optional[date] = None
    expiry_date: Optional[date] = None
    recommendations: Optional[str] = None
    business_id: Optional[int] = None
    responsible_name: Optional[str] = None
    tags: Optional[str] = None


class PremisaUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    budget_line: Optional[str] = None
    estimated_amount: Optional[Decimal] = None
    actual_amount: Optional[Decimal] = None
    variance_pct: Optional[Decimal] = None
    assumption_basis: Optional[str] = None
    risk_if_wrong: Optional[str] = None
    review_date: Optional[date] = None
    expiry_date: Optional[date] = None
    recommendations: Optional[str] = None
    ai_recommendation: Optional[str] = None
    responsible_name: Optional[str] = None
    tags: Optional[str] = None


class TimelineCreate(BaseModel):
    action: str
    description: str


def _premisa_to_dict(p):
    return {
        "id": p.id, "title": p.title, "description": p.description,
        "category": p.category, "status": p.status.value if hasattr(p.status, 'value') else p.status,
        "budget_year": p.budget_year, "budget_line": p.budget_line,
        "estimated_amount": float(p.estimated_amount) if p.estimated_amount else None,
        "actual_amount": float(p.actual_amount) if p.actual_amount else None,
        "variance_pct": float(p.variance_pct) if p.variance_pct else None,
        "assumption_basis": p.assumption_basis, "risk_if_wrong": p.risk_if_wrong,
        "review_date": str(p.review_date) if p.review_date else None,
        "expiry_date": str(p.expiry_date) if p.expiry_date else None,
        "recommendations": p.recommendations, "ai_recommendation": p.ai_recommendation,
        "responsible_name": p.responsible_name, "tags": p.tags,
        "created_by": {"id": p.created_by.id, "full_name": p.created_by.full_name} if p.created_by else None,
        "business": {"id": p.business.id, "name": p.business.name} if p.business else None,
        "created_at": p.created_at, "updated_at": p.updated_at,
    }


@router.post("", status_code=201)
async def create_premisa(payload: PremisaCreate, db: DB, user: CurrentUser):
    premisa = PremisaNegocio(created_by_id=user.id, **payload.model_dump())
    db.add(premisa)
    await db.flush()
    db.add(PremisaTimeline(premisa_id=premisa.id, user_id=user.id, action="created", description="Premisa creada"))
    await db.flush()
    await db.refresh(premisa)
    return {"id": premisa.id}


@router.get("")
async def list_premisas(
    db: DB, user: CurrentUser,
    year: Optional[int] = None, category: Optional[str] = None,
    status: Optional[str] = None, skip: int = 0, limit: int = 50,
):
    query = (
        select(PremisaNegocio)
        .where(PremisaNegocio.is_deleted == False)
        .options(selectinload(PremisaNegocio.created_by).selectinload(User.main_business), selectinload(PremisaNegocio.business))
    )
    if year:
        query = query.where(PremisaNegocio.budget_year == year)
    if category:
        query = query.where(PremisaNegocio.category == category)
    if status:
        query = query.where(PremisaNegocio.status == status)
    query = query.order_by(PremisaNegocio.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return [_premisa_to_dict(p) for p in result.scalars().all()]


@router.get("/dashboard/stats")
async def premisas_dashboard(db: DB, user: CurrentUser):
    total = (await db.execute(select(func.count(PremisaNegocio.id)).where(PremisaNegocio.is_deleted == False))).scalar()
    total_est = (await db.execute(select(func.sum(PremisaNegocio.estimated_amount)).where(PremisaNegocio.is_deleted == False))).scalar()
    total_real = (await db.execute(select(func.sum(PremisaNegocio.actual_amount)).where(PremisaNegocio.is_deleted == False))).scalar()
    by_status = await db.execute(
        select(PremisaNegocio.status, func.count(PremisaNegocio.id))
        .where(PremisaNegocio.is_deleted == False)
        .group_by(PremisaNegocio.status)
    )
    by_category = await db.execute(
        select(PremisaNegocio.category, func.count(PremisaNegocio.id))
        .where(PremisaNegocio.is_deleted == False)
        .group_by(PremisaNegocio.category)
    )
    return {
        "total": total,
        "total_estimated": float(total_est or 0),
        "total_actual": float(total_real or 0),
        "by_status": {(r[0].value if hasattr(r[0], 'value') else r[0]): r[1] for r in by_status},
        "by_category": {r[0]: r[1] for r in by_category},
    }


@router.get("/{premisa_id}")
async def get_premisa(premisa_id: int, db: DB, user: CurrentUser):
    result = await db.execute(
        select(PremisaNegocio)
        .where(PremisaNegocio.id == premisa_id, PremisaNegocio.is_deleted == False)
        .options(
            selectinload(PremisaNegocio.created_by).selectinload(User.main_business),
            selectinload(PremisaNegocio.business),
            selectinload(PremisaNegocio.timeline).selectinload(PremisaTimeline.user).selectinload(User.main_business),
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Premisa no encontrada")
    data = _premisa_to_dict(p)
    data["timeline"] = [{
        "id": t.id, "action": t.action, "description": t.description,
        "user_name": t.user.full_name if t.user else None,
        "created_at": t.created_at,
    } for t in p.timeline]
    return data


@router.patch("/{premisa_id}")
async def update_premisa(premisa_id: int, payload: PremisaUpdate, db: DB, user: CurrentUser):
    result = await db.execute(select(PremisaNegocio).where(PremisaNegocio.id == premisa_id, PremisaNegocio.is_deleted == False))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Premisa no encontrada")
    update_data = payload.model_dump(exclude_unset=True)

    if "actual_amount" in update_data and p.estimated_amount:
        actual = Decimal(str(update_data["actual_amount"]))
        variance = ((actual - p.estimated_amount) / p.estimated_amount * 100) if p.estimated_amount else None
        update_data["variance_pct"] = variance

    if "status" in update_data:
        db.add(PremisaTimeline(
            premisa_id=p.id, user_id=user.id, action="status_change",
            description=f"Estado cambiado a {update_data['status']}",
        ))

    for field, value in update_data.items():
        setattr(p, field, value)
    await db.flush()
    return {"id": p.id}


@router.post("/{premisa_id}/timeline", status_code=201)
async def add_timeline(premisa_id: int, payload: TimelineCreate, db: DB, user: CurrentUser):
    result = await db.execute(select(PremisaNegocio).where(PremisaNegocio.id == premisa_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Premisa no encontrada")
    entry = PremisaTimeline(premisa_id=premisa_id, user_id=user.id, **payload.model_dump())
    db.add(entry)
    await db.flush()
    return {"id": entry.id}


@router.delete("/{premisa_id}", status_code=204)
async def delete_premisa(premisa_id: int, db: DB, user: CurrentUser):
    result = await db.execute(select(PremisaNegocio).where(PremisaNegocio.id == premisa_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Premisa no encontrada")
    p.is_deleted = True
    await db.flush()
