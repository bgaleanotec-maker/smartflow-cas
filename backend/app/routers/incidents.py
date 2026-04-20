from typing import Optional, List
from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.deps import DB, CurrentUser
from app.models.incident import Incident, IncidentTimeline, IncidentStatus
from app.models.user import User
from app.models.business import Business
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
            selectinload(Incident.responsible).selectinload(User.main_business),
            selectinload(Incident.reporter).selectinload(User.main_business),
            selectinload(Incident.timeline).selectinload(IncidentTimeline.user).selectinload(User.main_business),
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

    # Role-based visibility (CAST to avoid PG enum cast errors with new enum values)
    from sqlalchemy import text as _t, or_ as _or
    role_val = str(current_user.role.value) if hasattr(current_user.role, 'value') else str(current_user.role)

    async def _ids_by_role_inc(role_name: str):
        res = await db.execute(_t(f"SELECT id FROM users WHERE CAST(role AS VARCHAR) = '{role_name}'"))
        return [r[0] for r in res.fetchall()]

    if role_val == "leader":
        lider_sr_ids = await _ids_by_role_inc("lider_sr")
        if lider_sr_ids:
            query = query.where(
                _or(
                    ~Incident.reporter_id.in_(lider_sr_ids),
                    Incident.responsible_id == current_user.id,
                    Incident.reporter_id == current_user.id,
                )
            )
    elif role_val == "negocio":
        neg_ids = await _ids_by_role_inc("negocio")
        if neg_ids:
            query = query.where(_or(Incident.reporter_id.in_(neg_ids), Incident.responsible_id == current_user.id))
        else:
            query = query.where(Incident.responsible_id == current_user.id)
    elif role_val == "herramientas":
        herr_ids = await _ids_by_role_inc("herramientas")
        if herr_ids:
            query = query.where(_or(Incident.reporter_id.in_(herr_ids), Incident.responsible_id == current_user.id))
        else:
            query = query.where(Incident.responsible_id == current_user.id)
    elif role_val not in ("admin", "lider_sr"):
        query = query.where(
            _or(Incident.reporter_id == current_user.id, Incident.responsible_id == current_user.id)
        )
    # admin and lider_sr see everything

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
    # Reload with eager-loaded relationships to avoid async lazy-load error
    result2 = await db.execute(
        select(Incident)
        .options(
            selectinload(Incident.responsible).selectinload(User.main_business),
            selectinload(Incident.reporter).selectinload(User.main_business),
            selectinload(Incident.timeline).selectinload(IncidentTimeline.user).selectinload(User.main_business),
        )
        .where(Incident.id == incident.id)
    )
    incident = result2.scalar_one()
    return incident


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(
        select(Incident)
        .options(
            selectinload(Incident.responsible).selectinload(User.main_business),
            selectinload(Incident.reporter).selectinload(User.main_business),
            selectinload(Incident.category),
            selectinload(Incident.business),
            selectinload(Incident.timeline).selectinload(IncidentTimeline.user).selectinload(User.main_business),
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
    # Reload with eager-loaded relationships to avoid async lazy-load error
    result2 = await db.execute(
        select(Incident)
        .options(
            selectinload(Incident.responsible).selectinload(User.main_business),
            selectinload(Incident.reporter).selectinload(User.main_business),
            selectinload(Incident.timeline).selectinload(IncidentTimeline.user).selectinload(User.main_business),
        )
        .where(Incident.id == incident.id)
    )
    incident = result2.scalar_one()
    return incident


@router.delete("/{incident_id}", status_code=204)
async def delete_incident(incident_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id, Incident.is_deleted == False)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incidente no encontrado")
    incident.is_deleted = True
    timeline_entry = IncidentTimeline(
        incident_id=incident.id,
        user_id=current_user.id,
        action="updated",
        description=f"Incidente eliminado por {current_user.full_name}",
    )
    db.add(timeline_entry)
    await db.flush()


class CommentBody(BaseModel):
    comment: str
    type: str = "comment"  # "comment" | "update" | "escalation" | "resolution"


@router.post("/{incident_id}/comment", status_code=status.HTTP_201_CREATED)
async def add_comment(
    incident_id: int, payload: CommentBody, db: DB, current_user: CurrentUser
):
    """Agrega un comentario o entrada al timeline del incidente.
    Antes aceptaba el comentario como query param — ahora usa JSON body (fix BUG-006)."""
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id, Incident.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Incidente no encontrado")

    action = payload.type if payload.type in ("comment", "update", "escalation", "resolution") else "comment"
    entry = IncidentTimeline(
        incident_id=incident_id,
        user_id=current_user.id,
        action=action,
        description=payload.comment,
    )
    db.add(entry)
    await db.flush()
    return {"message": "Comentario agregado", "action": action}


@router.get("/summary/by-business")
async def incidents_business_summary(db: DB, current_user: CurrentUser):
    """Returns per-business incident summary: count, total economic impact, affected users, status breakdown."""
    from sqlalchemy import func as sqlfunc, case

    result = await db.execute(
        select(Incident).where(Incident.is_deleted == False)
        .options(selectinload(Incident.business))
    )
    incidents = result.scalars().all()

    # Also load businesses
    biz_result = await db.execute(select(Business).where(Business.is_active == True))
    businesses = {b.id: b for b in biz_result.scalars().all()}

    summary = {}
    for inc in incidents:
        biz_id = inc.business_id or 0
        if biz_id not in summary:
            biz = businesses.get(biz_id)
            summary[biz_id] = {
                "business_id": biz_id or None,
                "business_name": biz.name if biz else "Sin negocio",
                "business_color": biz.color if biz else "#64748b",
                "count": 0,
                "total_economic_impact": 0.0,
                "total_affected_users": 0,
                "status_counts": {
                    "abierto": 0,
                    "en_investigacion": 0,
                    "resuelto": 0,
                    "cerrado": 0,
                },
            }
        s = summary[biz_id]
        s["count"] += 1
        if inc.has_economic_impact and inc.economic_impact_amount:
            s["total_economic_impact"] += float(inc.economic_impact_amount)
        if inc.affected_users_count:
            s["total_affected_users"] += inc.affected_users_count
        status_key = inc.status.value if hasattr(inc.status, 'value') else str(inc.status)
        if status_key in s["status_counts"]:
            s["status_counts"][status_key] += 1

    return sorted(summary.values(), key=lambda x: x["count"], reverse=True)
