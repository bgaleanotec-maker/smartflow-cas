from typing import Optional, List
from fastapi import APIRouter, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.deps import DB, CurrentUser
from app.models.incident import Incident, IncidentTimeline, IncidentStatus
from app.schemas.incident import IncidentCreate, IncidentUpdate, IncidentResponse

router = APIRouter(prefix="/incidents", tags=["Incidentes"])

_incident_counter = {}  # In production, use DB sequence


async def _get_next_incident_number(db: DB) -> str:
    from sqlalchemy import func as sqlfunc
    result = await db.execute(select(sqlfunc.count(Incident.id)))
    count = result.scalar() or 0
    return f"INC-{str(count + 1).zfill(4)}"


@router.get("", response_model=List[IncidentResponse])
async def list_incidents(
    db: DB,
    current_user: CurrentUser,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    business_id: Optional[int] = None,
    category_id: Optional[int] = None,
    responsible_id: Optional[int] = None,
    has_economic_impact: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
):
    query = (
        select(Incident)
        .options(
            selectinload(Incident.responsible),
            selectinload(Incident.reporter),
            selectinload(Incident.timeline).selectinload(IncidentTimeline.user),
        )
        .where(Incident.is_deleted == False)
        .order_by(Incident.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    if severity:
        query = query.where(Incident.severity == severity)
    if status:
        query = query.where(Incident.status == status)
    if business_id:
        query = query.where(Incident.business_id == business_id)
    if category_id:
        query = query.where(Incident.category_id == category_id)
    if responsible_id:
        query = query.where(Incident.responsible_id == responsible_id)
    if has_economic_impact is not None:
        query = query.where(Incident.has_economic_impact == has_economic_impact)
    if search:
        query = query.where(Incident.title.ilike(f"%{search}%"))

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(payload: IncidentCreate, db: DB, current_user: CurrentUser):
    incident_number = await _get_next_incident_number(db)

    incident = Incident(
        incident_number=incident_number,
        title=payload.title,
        description=payload.description,
        category_id=payload.category_id,
        business_id=payload.business_id,
        severity=payload.severity,
        responsible_id=payload.responsible_id,
        reporter_id=current_user.id,
        has_economic_impact=payload.has_economic_impact,
        economic_impact_amount=payload.economic_impact_amount,
        economic_impact_description=payload.economic_impact_description,
        affected_users_count=payload.affected_users_count,
        detection_date=payload.detection_date,
        related_project_id=payload.related_project_id,
        tags=payload.tags,
    )
    db.add(incident)
    await db.flush()

    # Add timeline entry
    timeline_entry = IncidentTimeline(
        incident_id=incident.id,
        user_id=current_user.id,
        action="created",
        description=f"Incidente creado por {current_user.full_name}",
    )
    db.add(timeline_entry)
    await db.flush()
    await db.refresh(incident)
    return incident


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(
        select(Incident)
        .options(
            selectinload(Incident.responsible),
            selectinload(Incident.reporter),
            selectinload(Incident.category),
            selectinload(Incident.business),
            selectinload(Incident.timeline).selectinload(IncidentTimeline.user),
        )
        .where(Incident.id == incident_id, Incident.is_deleted == False)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incidente no encontrado")
    return incident


@router.patch("/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: int, payload: IncidentUpdate, db: DB, current_user: CurrentUser
):
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id, Incident.is_deleted == False)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incidente no encontrado")

    update_data = payload.model_dump(exclude_unset=True)
    changes = []

    for field, value in update_data.items():
        old_value = getattr(incident, field)
        if old_value != value:
            changes.append((field, str(old_value), str(value)))
            setattr(incident, field, value)

    # Log changes to timeline
    for field, old_val, new_val in changes:
        timeline_entry = IncidentTimeline(
            incident_id=incident.id,
            user_id=current_user.id,
            action="updated",
            description=f"Campo '{field}' actualizado",
            old_value=old_val,
            new_value=new_val,
        )
        db.add(timeline_entry)

    # Auto-set resolution date
    if payload.status == IncidentStatus.RESOLVED and not incident.resolution_date:
        from datetime import datetime, timezone
        incident.resolution_date = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(incident)
    return incident


@router.post("/{incident_id}/comment", status_code=status.HTTP_201_CREATED)
async def add_comment(
    incident_id: int, comment: str, db: DB, current_user: CurrentUser
):
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Incidente no encontrado")

    entry = IncidentTimeline(
        incident_id=incident_id,
        user_id=current_user.id,
        action="comment",
        description=comment,
    )
    db.add(entry)
    await db.flush()
    return {"message": "Comentario agregado"}
