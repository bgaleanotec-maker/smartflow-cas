"""Novedades Operativas — noticias/eventos relevantes de la operación CAS BO."""
from typing import Optional
from decimal import Decimal
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.deps import DB, CurrentUser
from app.models.business_intel import NovedadOperativa
from app.models.user import User

router = APIRouter(prefix="/novedades", tags=["Novedades Operativas"])


class NovedadCreate(BaseModel):
    title: str
    description: Optional[str] = None
    business_id: Optional[int] = None
    has_economic_impact: bool = False
    economic_impact_amount: Optional[Decimal] = None
    impact_type: str = "OTRO"           # OPEX | ON | OTRO
    importance_stars: int = 3           # 1-5
    impact_sentiment: str = "neutral"   # positivo | neutral | negativo
    has_reproceso: bool = False
    reproceso_hours: Optional[Decimal] = None
    reproceso_status: str = "sin_iniciar"  # subsanado | en_proceso | sin_iniciar


class NovedadUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    business_id: Optional[int] = None
    has_economic_impact: Optional[bool] = None
    economic_impact_amount: Optional[Decimal] = None
    impact_type: Optional[str] = None
    importance_stars: Optional[int] = None
    impact_sentiment: Optional[str] = None
    has_reproceso: Optional[bool] = None
    reproceso_hours: Optional[Decimal] = None
    reproceso_status: Optional[str] = None
    status: Optional[str] = None       # activa | archivada


def _to_dict(n: NovedadOperativa) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "description": n.description,
        "business_id": n.business_id,
        "business_name": n.business.name if n.business else None,
        "business_color": n.business.color if n.business else None,
        "has_economic_impact": n.has_economic_impact,
        "economic_impact_amount": float(n.economic_impact_amount) if n.economic_impact_amount else None,
        "impact_type": n.impact_type,
        "importance_stars": n.importance_stars,
        "impact_sentiment": n.impact_sentiment,
        "has_reproceso": n.has_reproceso,
        "reproceso_hours": float(n.reproceso_hours) if n.reproceso_hours else None,
        "reproceso_status": n.reproceso_status,
        "status": n.status,
        "created_by_id": n.created_by_id,
        "created_by_name": n.created_by.full_name if n.created_by else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


@router.get("")
async def list_novedades(
    db: DB, user: CurrentUser,
    status: Optional[str] = None,
    business_id: Optional[int] = None,
    impact_type: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0, limit: int = 100,
):
    q = (
        select(NovedadOperativa)
        .where(NovedadOperativa.is_deleted == False)
        .options(
            selectinload(NovedadOperativa.created_by),
            selectinload(NovedadOperativa.business),
        )
        .order_by(
            NovedadOperativa.importance_stars.desc(),
            NovedadOperativa.created_at.desc(),
        )
    )
    if status:
        q = q.where(NovedadOperativa.status == status)
    if business_id:
        q = q.where(NovedadOperativa.business_id == business_id)
    if impact_type:
        q = q.where(NovedadOperativa.impact_type == impact_type)
    if search:
        q = q.where(NovedadOperativa.title.ilike(f"%{search}%"))
    q = q.offset(skip).limit(limit)

    result = await db.execute(q)
    return [_to_dict(n) for n in result.scalars().all()]


@router.post("", status_code=201)
async def create_novedad(payload: NovedadCreate, db: DB, user: CurrentUser):
    n = NovedadOperativa(
        created_by_id=user.id,
        **payload.model_dump(),
    )
    db.add(n)
    await db.flush()
    # reload with relations
    result = await db.execute(
        select(NovedadOperativa)
        .options(
            selectinload(NovedadOperativa.created_by),
            selectinload(NovedadOperativa.business),
        )
        .where(NovedadOperativa.id == n.id)
    )
    return _to_dict(result.scalar_one())


@router.get("/{novedad_id}")
async def get_novedad(novedad_id: int, db: DB, user: CurrentUser):
    result = await db.execute(
        select(NovedadOperativa)
        .where(NovedadOperativa.id == novedad_id, NovedadOperativa.is_deleted == False)
        .options(
            selectinload(NovedadOperativa.created_by),
            selectinload(NovedadOperativa.business),
        )
    )
    n = result.scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="Novedad no encontrada")
    return _to_dict(n)


@router.patch("/{novedad_id}")
async def update_novedad(novedad_id: int, payload: NovedadUpdate, db: DB, user: CurrentUser):
    result = await db.execute(
        select(NovedadOperativa).where(NovedadOperativa.id == novedad_id, NovedadOperativa.is_deleted == False)
    )
    n = result.scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="Novedad no encontrada")

    role_val = str(getattr(user.role, "value", user.role))
    can_edit = n.created_by_id == user.id or role_val in ("admin", "leader", "lider_sr")
    if not can_edit:
        raise HTTPException(status_code=403, detail="Sin permiso para editar esta novedad")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(n, field, value)
    await db.flush()

    result2 = await db.execute(
        select(NovedadOperativa)
        .options(
            selectinload(NovedadOperativa.created_by),
            selectinload(NovedadOperativa.business),
        )
        .where(NovedadOperativa.id == n.id)
    )
    return _to_dict(result2.scalar_one())


@router.delete("/{novedad_id}", status_code=204)
async def delete_novedad(novedad_id: int, db: DB, user: CurrentUser):
    result = await db.execute(
        select(NovedadOperativa).where(NovedadOperativa.id == novedad_id, NovedadOperativa.is_deleted == False)
    )
    n = result.scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="Novedad no encontrada")

    role_val = str(getattr(user.role, "value", user.role))
    if n.created_by_id != user.id and role_val not in ("admin", "leader", "lider_sr"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    n.is_deleted = True
    await db.flush()


@router.get("/export/csv")
async def export_novedades_csv(db: DB, user: CurrentUser):
    """Export all active novedades as CSV."""
    import io, csv
    result = await db.execute(
        select(NovedadOperativa)
        .where(NovedadOperativa.is_deleted == False)
        .options(
            selectinload(NovedadOperativa.created_by),
            selectinload(NovedadOperativa.business),
        )
        .order_by(NovedadOperativa.created_at.desc())
    )
    novedades = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Título", "Descripción", "Negocio", "Tipo Impacto",
        "Sentimiento", "Importancia (★)", "Impacto Económico", "Monto COP",
        "Reproceso", "Horas Reproceso", "Estado Reproceso",
        "Estado", "Creado por", "Fecha",
    ])
    for n in novedades:
        writer.writerow([
            n.id, n.title, n.description or "",
            n.business.name if n.business else "",
            n.impact_type,
            n.impact_sentiment,
            n.importance_stars,
            "Sí" if n.has_economic_impact else "No",
            float(n.economic_impact_amount) if n.economic_impact_amount else "",
            "Sí" if n.has_reproceso else "No",
            float(n.reproceso_hours) if n.reproceso_hours else "",
            n.reproceso_status if n.has_reproceso else "",
            n.status,
            n.created_by.full_name if n.created_by else "",
            n.created_at.strftime("%Y-%m-%d %H:%M") if n.created_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=novedades_operativas.csv"},
    )
