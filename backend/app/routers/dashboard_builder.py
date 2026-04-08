from typing import Optional
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.deps import DB, CurrentUser, HerramientasOrAbove
from app.models.activities import DashboardWidget, ActivityScope

router = APIRouter(prefix="/dashboard-builder", tags=["Dashboard Builder"])


class WidgetCreate(BaseModel):
    title: str
    widget_type: str
    description: Optional[str] = None
    data_source: str = "custom"
    data_query: Optional[str] = None
    data_field: Optional[str] = None
    grid_col: int = 0
    grid_row: int = 0
    grid_width: int = 1
    grid_height: int = 1
    color: str = "#6366f1"
    icon: Optional[str] = None
    scope: str = "TODOS"
    custom_content: Optional[str] = None
    order_index: int = 0


class WidgetUpdate(BaseModel):
    title: Optional[str] = None
    widget_type: Optional[str] = None
    description: Optional[str] = None
    data_source: Optional[str] = None
    data_query: Optional[str] = None
    data_field: Optional[str] = None
    grid_col: Optional[int] = None
    grid_row: Optional[int] = None
    grid_width: Optional[int] = None
    grid_height: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    scope: Optional[str] = None
    custom_content: Optional[str] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None


@router.post("", status_code=201)
async def create_widget(payload: WidgetCreate, db: DB, user: CurrentUser):
    widget = DashboardWidget(created_by_id=user.id, **payload.model_dump())
    db.add(widget)
    await db.flush()
    await db.refresh(widget)
    return {"id": widget.id}


@router.get("")
async def list_widgets(db: DB, user: CurrentUser, scope: Optional[str] = None):
    query = (
        select(DashboardWidget)
        .where(DashboardWidget.is_active == True)
        .options(selectinload(DashboardWidget.created_by))
        .order_by(DashboardWidget.order_index)
    )
    if scope:
        query = query.where(DashboardWidget.scope.in_([scope, "TODOS"]))
    result = await db.execute(query)
    return [{
        "id": w.id, "title": w.title, "widget_type": w.widget_type,
        "description": w.description,
        "data_source": w.data_source, "data_query": w.data_query, "data_field": w.data_field,
        "grid_col": w.grid_col, "grid_row": w.grid_row,
        "grid_width": w.grid_width, "grid_height": w.grid_height,
        "color": w.color, "icon": w.icon, "scope": w.scope.value,
        "custom_content": w.custom_content, "order_index": w.order_index,
        "created_by": {"id": w.created_by.id, "full_name": w.created_by.full_name} if w.created_by else None,
    } for w in result.scalars().all()]


@router.patch("/{widget_id}")
async def update_widget(widget_id: int, payload: WidgetUpdate, db: DB, user: CurrentUser):
    result = await db.execute(select(DashboardWidget).where(DashboardWidget.id == widget_id))
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Widget no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(w, field, value)
    await db.flush()
    return {"id": w.id}


@router.delete("/{widget_id}", status_code=204)
async def delete_widget(widget_id: int, db: DB, user: CurrentUser):
    result = await db.execute(select(DashboardWidget).where(DashboardWidget.id == widget_id))
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Widget no encontrado")
    w.is_active = False
    await db.flush()


@router.get("/data/{source}")
async def get_widget_data(source: str, db: DB, user: CurrentUser, scope: Optional[str] = None):
    """Get aggregated data for a widget based on its data source."""
    from app.models.activities import RecurringActivity, ActivityInstance, ActivityStatus
    from app.models.demand import DemandRequest, DemandStatus
    from app.models.incident import Incident
    from app.models.project import Project
    from datetime import date, timedelta

    today = date.today()

    if source == "activities":
        total = (await db.execute(select(func.count(ActivityInstance.id)))).scalar()
        pendientes = (await db.execute(
            select(func.count(ActivityInstance.id)).where(ActivityInstance.status.in_([ActivityStatus.SIN_INICIAR, ActivityStatus.EN_PROCESO]))
        )).scalar()
        completadas = (await db.execute(
            select(func.count(ActivityInstance.id)).where(ActivityInstance.status == ActivityStatus.COMPLETADA)
        )).scalar()
        vencidas = (await db.execute(
            select(func.count(ActivityInstance.id)).where(
                ActivityInstance.due_date < today,
                ActivityInstance.status.in_([ActivityStatus.SIN_INICIAR, ActivityStatus.EN_PROCESO])
            )
        )).scalar()
        return {"total": total, "pendientes": pendientes, "completadas": completadas, "vencidas": vencidas}

    elif source == "demands":
        total = (await db.execute(select(func.count(DemandRequest.id)).where(DemandRequest.is_deleted == False))).scalar()
        by_status = await db.execute(
            select(DemandRequest.status, func.count(DemandRequest.id))
            .where(DemandRequest.is_deleted == False).group_by(DemandRequest.status)
        )
        return {"total": total, "by_status": {r[0].value: r[1] for r in by_status}}

    elif source == "incidents":
        total = (await db.execute(select(func.count(Incident.id)).where(Incident.is_deleted == False))).scalar()
        by_status = await db.execute(
            select(Incident.status, func.count(Incident.id))
            .where(Incident.is_deleted == False).group_by(Incident.status)
        )
        return {"total": total, "by_status": {r[0].value if hasattr(r[0], 'value') else r[0]: r[1] for r in by_status}}

    elif source == "projects":
        total = (await db.execute(select(func.count(Project.id)).where(Project.is_deleted == False))).scalar()
        by_status = await db.execute(
            select(Project.status, func.count(Project.id))
            .where(Project.is_deleted == False).group_by(Project.status)
        )
        return {"total": total, "by_status": {r[0].value if hasattr(r[0], 'value') else r[0]: r[1] for r in by_status}}

    return {"error": "Fuente de datos no soportada"}
