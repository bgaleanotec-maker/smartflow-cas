from typing import List, Optional
from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from app.core.deps import DB, AdminUser
from app.models.demand_catalog import DemandCatalog
from app.models.demand_custom_field import DemandCustomField
from app.schemas.demand import (
    DemandCatalogCreate, DemandCatalogUpdate, DemandCatalogResponse,
    DemandCustomFieldCreate, DemandCustomFieldUpdate, DemandCustomFieldResponse,
)

router = APIRouter(prefix="/admin/demand", tags=["Admin - Gestion Demanda"])


# ─── Catalogs ────────────────────────────────────────────────────────────────

@router.get("/catalogs", response_model=List[DemandCatalogResponse])
async def list_catalogs(db: DB, admin: AdminUser, catalog_type: Optional[str] = None):
    query = select(DemandCatalog).order_by(DemandCatalog.catalog_type, DemandCatalog.order_index)
    if catalog_type:
        query = query.where(DemandCatalog.catalog_type == catalog_type)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/catalogs", response_model=DemandCatalogResponse, status_code=201)
async def create_catalog(payload: DemandCatalogCreate, db: DB, admin: AdminUser):
    existing = await db.execute(
        select(DemandCatalog).where(
            DemandCatalog.catalog_type == payload.catalog_type,
            DemandCatalog.name == payload.name,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya existe una opcion con ese nombre en este catalogo")

    cat = DemandCatalog(**payload.model_dump())
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.patch("/catalogs/{cat_id}", response_model=DemandCatalogResponse)
async def update_catalog(cat_id: int, payload: DemandCatalogUpdate, db: DB, admin: AdminUser):
    result = await db.execute(select(DemandCatalog).where(DemandCatalog.id == cat_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Opcion de catalogo no encontrada")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cat, field, value)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.delete("/catalogs/{cat_id}", status_code=204)
async def delete_catalog(cat_id: int, db: DB, admin: AdminUser):
    result = await db.execute(select(DemandCatalog).where(DemandCatalog.id == cat_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Opcion no encontrada")
    cat.is_active = False
    await db.flush()


# ─── Custom Fields ───────────────────────────────────────────────────────────

@router.get("/custom-fields", response_model=List[DemandCustomFieldResponse])
async def list_custom_fields(db: DB, admin: AdminUser):
    result = await db.execute(
        select(DemandCustomField).order_by(DemandCustomField.section, DemandCustomField.order_index)
    )
    return result.scalars().all()


@router.post("/custom-fields", response_model=DemandCustomFieldResponse, status_code=201)
async def create_custom_field(payload: DemandCustomFieldCreate, db: DB, admin: AdminUser):
    existing = await db.execute(
        select(DemandCustomField).where(DemandCustomField.field_name == payload.field_name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya existe un campo con ese nombre")

    field = DemandCustomField(**payload.model_dump())
    db.add(field)
    await db.flush()
    await db.refresh(field)
    return field


@router.patch("/custom-fields/{field_id}", response_model=DemandCustomFieldResponse)
async def update_custom_field(field_id: int, payload: DemandCustomFieldUpdate, db: DB, admin: AdminUser):
    result = await db.execute(select(DemandCustomField).where(DemandCustomField.id == field_id))
    field = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Campo no encontrado")

    for f, value in payload.model_dump(exclude_unset=True).items():
        setattr(field, f, value)
    await db.flush()
    await db.refresh(field)
    return field


@router.delete("/custom-fields/{field_id}", status_code=204)
async def delete_custom_field(field_id: int, db: DB, admin: AdminUser):
    result = await db.execute(select(DemandCustomField).where(DemandCustomField.id == field_id))
    field = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Campo no encontrado")
    field.is_active = False
    await db.flush()
