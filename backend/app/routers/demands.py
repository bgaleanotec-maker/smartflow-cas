from typing import List, Optional
from datetime import datetime, date
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, func, extract, case, and_
from sqlalchemy.orm import selectinload
from app.core.deps import DB, CurrentUser, HerramientasOrAbove
from app.models.demand import (
    DemandRequest, DemandStatus, DemandTimeline,
    DemandMeetingNote, DemandRequirement, RequirementStatus,
)
from app.models.demand_catalog import DemandCatalog
from app.models.user import User, UserRole
from app.schemas.demand import (
    DemandRequestCreate, DemandRequestUpdate, DemandRequestResponse,
    DemandRequestDetail, DemandTimelineCreate, DemandTimelineResponse,
    DemandMeetingNoteCreate, DemandMeetingNoteUpdate, DemandMeetingNoteResponse,
    DemandRequirementCreate, DemandRequirementUpdate, DemandRequirementResponse,
    DemandDashboardStats, UserInfo, DemandCatalogInfo,
)

router = APIRouter(prefix="/demands", tags=["Gestion de Demanda"])


async def _next_demand_number(db) -> str:
    result = await db.execute(
        select(func.count(DemandRequest.id))
    )
    count = result.scalar() or 0
    return f"GD-{count + 1:04d}"


def _build_response(d: DemandRequest) -> dict:
    """Build response dict from a DemandRequest with loaded relations."""
    data = {
        "id": d.id, "demand_number": d.demand_number, "radicado": d.radicado,
        "title": d.title, "status": d.status.value if d.status else d.status,
        "vicepresidencia_id": d.vicepresidencia_id,
        "telefono_contacto": d.telefono_contacto,
        "enfoque": d.enfoque, "aplicaciones": d.aplicaciones,
        "situacion_actual": d.situacion_actual,
        "pilares_estrategicos_id": d.pilares_estrategicos_id,
        "justificacion_pilares": d.justificacion_pilares,
        "mejoras_procesos_id": d.mejoras_procesos_id,
        "descripcion_procesos": d.descripcion_procesos,
        "usuarios_impactados_id": d.usuarios_impactados_id,
        "detalle_clientes_impactados": d.detalle_clientes_impactados,
        "reduce_riesgo_id": d.reduce_riesgo_id,
        "explicacion_riesgo": d.explicacion_riesgo,
        "oportunidad_negocio": d.oportunidad_negocio,
        "beneficio_tipo": d.beneficio_tipo.value if d.beneficio_tipo else None,
        "beneficio_monto_estimado": d.beneficio_monto_estimado,
        "beneficio_monto_real": d.beneficio_monto_real,
        "sponsor_name": d.sponsor_name,
        "lider_proceso_name": d.lider_proceso_name,
        "responsable_negocio_name": d.responsable_negocio_name,
        "responsable_negocio_email": d.responsable_negocio_email,
        "impacta_sox": d.impacta_sox, "sox_detalle": d.sox_detalle,
        "es_regulatorio": d.es_regulatorio, "regulatorio_detalle": d.regulatorio_detalle,
        "tiene_deadline": d.tiene_deadline, "fecha_deadline": d.fecha_deadline,
        "impacto_no_ejecutar": d.impacto_no_ejecutar,
        "detalle_requerimientos": d.detalle_requerimientos,
        "migracion_datos": d.migracion_datos,
        "created_by_id": d.created_by_id,
        "assigned_to_id": d.assigned_to_id,
        "business_id": d.business_id,
        "parent_demand_id": d.parent_demand_id,
        "related_project_id": d.related_project_id,
        "source_incident_id": d.source_incident_id,
        "custom_fields": d.custom_fields, "attachments": d.attachments,
        "tags": d.tags,
        "created_at": d.created_at, "updated_at": d.updated_at,
        "children_count": len(d.children) if d.children else 0,
        "requirements_count": len(d.requirements) if d.requirements else 0,
        "timeline_count": len(d.timeline) if d.timeline else 0,
    }
    if d.created_by:
        data["created_by"] = {"id": d.created_by.id, "full_name": d.created_by.full_name, "email": d.created_by.email, "role": d.created_by.role.value}
    if d.assigned_to:
        data["assigned_to"] = {"id": d.assigned_to.id, "full_name": d.assigned_to.full_name, "email": d.assigned_to.email, "role": d.assigned_to.role.value}
    for cat_name in ["vicepresidencia", "pilares_estrategicos", "mejoras_procesos", "usuarios_impactados", "reduce_riesgo"]:
        cat = getattr(d, cat_name, None)
        data[cat_name] = {"id": cat.id, "name": cat.name} if cat else None
    return data


# ─── CRUD ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_demand(payload: DemandRequestCreate, db: DB, user: CurrentUser):
    demand_number = await _next_demand_number(db)
    demand = DemandRequest(
        demand_number=demand_number,
        created_by_id=user.id,
        **payload.model_dump(exclude_unset=True),
    )
    db.add(demand)
    await db.flush()

    # Timeline entry
    db.add(DemandTimeline(
        demand_id=demand.id, user_id=user.id,
        action="created", description="Demanda creada",
    ))
    await db.flush()
    await db.refresh(demand)
    return {"id": demand.id, "demand_number": demand.demand_number}


@router.get("")
async def list_demands(
    db: DB, user: CurrentUser,
    status: Optional[str] = None,
    search: Optional[str] = None,
    vicepresidencia_id: Optional[int] = None,
    assigned_to_id: Optional[int] = None,
    parent_demand_id: Optional[int] = Query(None),
    skip: int = 0, limit: int = 50,
):
    query = (
        select(DemandRequest)
        .where(DemandRequest.is_deleted == False)
        .options(
            selectinload(DemandRequest.created_by).selectinload(User.main_business),
            selectinload(DemandRequest.assigned_to).selectinload(User.main_business),
            selectinload(DemandRequest.vicepresidencia),
            selectinload(DemandRequest.pilares_estrategicos),
            selectinload(DemandRequest.mejoras_procesos),
            selectinload(DemandRequest.usuarios_impactados),
            selectinload(DemandRequest.reduce_riesgo),
            selectinload(DemandRequest.children),
            selectinload(DemandRequest.requirements),
            selectinload(DemandRequest.timeline),
        )
    )

    # Negocio users only see their own demands
    if user.role == UserRole.NEGOCIO:
        query = query.where(DemandRequest.created_by_id == user.id)

    if status:
        query = query.where(DemandRequest.status == status)
    if vicepresidencia_id:
        query = query.where(DemandRequest.vicepresidencia_id == vicepresidencia_id)
    if assigned_to_id:
        query = query.where(DemandRequest.assigned_to_id == assigned_to_id)
    if parent_demand_id is not None:
        query = query.where(DemandRequest.parent_demand_id == parent_demand_id)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            DemandRequest.title.ilike(pattern)
            | DemandRequest.demand_number.ilike(pattern)
            | DemandRequest.radicado.ilike(pattern)
            | DemandRequest.sponsor_name.ilike(pattern)
        )

    query = query.order_by(DemandRequest.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    demands = result.scalars().all()

    # Count total
    count_query = select(func.count(DemandRequest.id)).where(DemandRequest.is_deleted == False)
    if user.role == UserRole.NEGOCIO:
        count_query = count_query.where(DemandRequest.created_by_id == user.id)
    total = (await db.execute(count_query)).scalar()

    return {"items": [_build_response(d) for d in demands], "total": total}


@router.get("/dashboard")
async def demand_dashboard(db: DB, user: HerramientasOrAbove):
    base = select(DemandRequest).where(DemandRequest.is_deleted == False)

    # Total
    total = (await db.execute(select(func.count(DemandRequest.id)).where(DemandRequest.is_deleted == False))).scalar()

    # By status
    status_result = await db.execute(
        select(DemandRequest.status, func.count(DemandRequest.id))
        .where(DemandRequest.is_deleted == False)
        .group_by(DemandRequest.status)
    )
    by_status = {row[0].value if hasattr(row[0], 'value') else row[0]: row[1] for row in status_result}

    # By month (last 12 months)
    month_result = await db.execute(
        select(
            extract("year", DemandRequest.created_at).label("year"),
            extract("month", DemandRequest.created_at).label("month"),
            func.count(DemandRequest.id),
        )
        .where(DemandRequest.is_deleted == False)
        .group_by("year", "month")
        .order_by("year", "month")
    )
    by_month = [{"year": int(r[0]), "month": int(r[1]), "count": r[2]} for r in month_result]

    # By vicepresidencia
    vp_result = await db.execute(
        select(DemandCatalog.name, func.count(DemandRequest.id))
        .join(DemandCatalog, DemandRequest.vicepresidencia_id == DemandCatalog.id)
        .where(DemandRequest.is_deleted == False)
        .group_by(DemandCatalog.name)
        .order_by(func.count(DemandRequest.id).desc())
    )
    by_vicepresidencia = [{"name": r[0], "count": r[1]} for r in vp_result]

    # Economic impact
    eco_result = await db.execute(
        select(
            func.sum(DemandRequest.beneficio_monto_estimado),
            func.sum(DemandRequest.beneficio_monto_real),
            func.count(DemandRequest.id).filter(DemandRequest.beneficio_monto_estimado > 0),
        )
        .where(DemandRequest.is_deleted == False)
    )
    eco = eco_result.one()
    economic_impact = {
        "total_estimado": float(eco[0] or 0),
        "total_real": float(eco[1] or 0),
        "demands_with_benefit": eco[2] or 0,
    }

    # Aging: demands in active states by age buckets
    from datetime import timedelta
    now = datetime.utcnow()
    active_statuses = [DemandStatus.ENVIADA, DemandStatus.EN_EVALUACION, DemandStatus.APROBADA, DemandStatus.EN_EJECUCION]

    aging_result = await db.execute(
        select(DemandRequest.created_at)
        .where(DemandRequest.is_deleted == False, DemandRequest.status.in_(active_statuses))
    )
    ages = aging_result.scalars().all()
    aging = {"over_30": 0, "over_60": 0, "over_90": 0}
    for created_at in ages:
        if created_at:
            days = (now - created_at.replace(tzinfo=None)).days
            if days > 90:
                aging["over_90"] += 1
            elif days > 60:
                aging["over_60"] += 1
            elif days > 30:
                aging["over_30"] += 1

    # Delayed demands (past deadline and not closed)
    delayed_result = await db.execute(
        select(DemandRequest)
        .where(
            DemandRequest.is_deleted == False,
            DemandRequest.tiene_deadline == True,
            DemandRequest.fecha_deadline < date.today(),
            DemandRequest.status.notin_([DemandStatus.CERRADA, DemandStatus.RECHAZADA]),
        )
        .options(selectinload(DemandRequest.assigned_to).selectinload(User.main_business))
        .limit(20)
    )
    delayed = delayed_result.scalars().all()
    delayed_demands = [{
        "id": d.id, "demand_number": d.demand_number, "title": d.title,
        "status": d.status.value, "fecha_deadline": str(d.fecha_deadline),
        "days_overdue": (date.today() - d.fecha_deadline).days,
        "assigned_to": d.assigned_to.full_name if d.assigned_to else None,
    } for d in delayed]

    return DemandDashboardStats(
        total=total,
        by_status=by_status,
        by_month=by_month,
        by_vicepresidencia=by_vicepresidencia,
        economic_impact=economic_impact,
        aging=aging,
        delayed_demands=delayed_demands,
    )


@router.get("/{demand_id}")
async def get_demand(demand_id: int, db: DB, user: CurrentUser):
    result = await db.execute(
        select(DemandRequest)
        .where(DemandRequest.id == demand_id, DemandRequest.is_deleted == False)
        .options(
            selectinload(DemandRequest.created_by).selectinload(User.main_business),
            selectinload(DemandRequest.assigned_to).selectinload(User.main_business),
            selectinload(DemandRequest.vicepresidencia),
            selectinload(DemandRequest.pilares_estrategicos),
            selectinload(DemandRequest.mejoras_procesos),
            selectinload(DemandRequest.usuarios_impactados),
            selectinload(DemandRequest.reduce_riesgo),
            selectinload(DemandRequest.children),
            selectinload(DemandRequest.timeline).selectinload(DemandTimeline.user).selectinload(User.main_business),
            selectinload(DemandRequest.meeting_notes).selectinload(DemandMeetingNote.created_by).selectinload(User.main_business),
            selectinload(DemandRequest.requirements),
        )
    )
    demand = result.scalar_one_or_none()
    if not demand:
        raise HTTPException(status_code=404, detail="Demanda no encontrada")

    if user.role == UserRole.NEGOCIO and demand.created_by_id != user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta demanda")

    data = _build_response(demand)
    data["timeline"] = [{
        "id": t.id, "demand_id": t.demand_id, "user_id": t.user_id,
        "user_name": t.user.full_name if t.user else None,
        "action": t.action, "description": t.description,
        "old_value": t.old_value, "new_value": t.new_value,
        "created_at": t.created_at,
    } for t in demand.timeline]
    data["meeting_notes"] = [{
        "id": n.id, "demand_id": n.demand_id, "title": n.title,
        "content": n.content, "meeting_date": n.meeting_date,
        "attendees": n.attendees, "action_items": n.action_items,
        "next_meeting_date": n.next_meeting_date,
        "reminder_sent": n.reminder_sent,
        "created_by_id": n.created_by_id,
        "created_by_name": n.created_by.full_name if n.created_by else None,
        "created_at": n.created_at, "updated_at": n.updated_at,
    } for n in demand.meeting_notes]
    data["requirements"] = [{
        "id": r.id, "demand_id": r.demand_id, "item_number": r.item_number,
        "modulo_impactado": r.modulo_impactado,
        "descripcion_requerimiento": r.descripcion_requerimiento,
        "quien": r.quien, "que": r.que,
        "criterios_aceptacion": r.criterios_aceptacion,
        "observaciones": r.observaciones,
        "status": r.status.value, "order_index": r.order_index,
        "created_at": r.created_at,
    } for r in demand.requirements]
    return data


@router.patch("/{demand_id}")
async def update_demand(demand_id: int, payload: DemandRequestUpdate, db: DB, user: CurrentUser):
    result = await db.execute(
        select(DemandRequest).where(DemandRequest.id == demand_id, DemandRequest.is_deleted == False)
    )
    demand = result.scalar_one_or_none()
    if not demand:
        raise HTTPException(status_code=404, detail="Demanda no encontrada")

    # Negocio can only edit their own demands in borrador/enviada status
    if user.role == UserRole.NEGOCIO:
        if demand.created_by_id != user.id:
            raise HTTPException(status_code=403, detail="No tienes acceso")
        if demand.status not in [DemandStatus.BORRADOR, DemandStatus.ENVIADA]:
            raise HTTPException(status_code=400, detail="Solo puedes editar demandas en estado borrador o enviada")

    update_data = payload.model_dump(exclude_unset=True)

    # Track status change in timeline
    if "status" in update_data and update_data["status"] != demand.status.value:
        old_status = demand.status.value
        db.add(DemandTimeline(
            demand_id=demand.id, user_id=user.id,
            action="status_change",
            description=f"Estado cambiado de {old_status} a {update_data['status']}",
            old_value=old_status, new_value=update_data["status"],
        ))

    # Track assignment change
    if "assigned_to_id" in update_data and update_data["assigned_to_id"] != demand.assigned_to_id:
        db.add(DemandTimeline(
            demand_id=demand.id, user_id=user.id,
            action="assignment",
            description="Demanda reasignada",
            old_value=str(demand.assigned_to_id) if demand.assigned_to_id else None,
            new_value=str(update_data["assigned_to_id"]),
        ))

    # Track radicado assignment
    if "radicado" in update_data and update_data["radicado"] != demand.radicado:
        db.add(DemandTimeline(
            demand_id=demand.id, user_id=user.id,
            action="field_update",
            description=f"Radicado asignado: {update_data['radicado']}",
            old_value=demand.radicado,
            new_value=update_data["radicado"],
        ))

    for field, value in update_data.items():
        setattr(demand, field, value)

    await db.flush()
    await db.refresh(demand)
    return {"id": demand.id, "status": demand.status.value}


@router.delete("/{demand_id}", status_code=204)
async def delete_demand(demand_id: int, db: DB, user: HerramientasOrAbove):
    result = await db.execute(
        select(DemandRequest).where(DemandRequest.id == demand_id)
    )
    demand = result.scalar_one_or_none()
    if not demand:
        raise HTTPException(status_code=404, detail="Demanda no encontrada")
    demand.is_deleted = True
    await db.flush()


# ─── Timeline ────────────────────────────────────────────────────────────────

@router.post("/{demand_id}/timeline", status_code=201)
async def add_timeline_entry(demand_id: int, payload: DemandTimelineCreate, db: DB, user: CurrentUser):
    result = await db.execute(
        select(DemandRequest).where(DemandRequest.id == demand_id, DemandRequest.is_deleted == False)
    )
    demand = result.scalar_one_or_none()
    if not demand:
        raise HTTPException(status_code=404, detail="Demanda no encontrada")

    if user.role == UserRole.NEGOCIO and demand.created_by_id != user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso")

    entry = DemandTimeline(
        demand_id=demand_id, user_id=user.id,
        **payload.model_dump(),
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return {"id": entry.id}


# ─── Requirements ────────────────────────────────────────────────────────────

@router.post("/{demand_id}/requirements", status_code=201)
async def add_requirement(demand_id: int, payload: DemandRequirementCreate, db: DB, user: CurrentUser):
    result = await db.execute(
        select(DemandRequest).where(DemandRequest.id == demand_id, DemandRequest.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Demanda no encontrada")

    req = DemandRequirement(
        demand_id=demand_id,
        order_index=payload.item_number,
        **payload.model_dump(),
    )
    db.add(req)
    await db.flush()
    await db.refresh(req)
    return {"id": req.id}


@router.patch("/{demand_id}/requirements/{req_id}")
async def update_requirement(demand_id: int, req_id: int, payload: DemandRequirementUpdate, db: DB, user: CurrentUser):
    result = await db.execute(
        select(DemandRequirement).where(
            DemandRequirement.id == req_id,
            DemandRequirement.demand_id == demand_id,
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Requerimiento no encontrado")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(req, field, value)
    await db.flush()
    return {"id": req.id, "status": req.status.value}


# ─── Meeting Notes ───────────────────────────────────────────────────────────

@router.post("/{demand_id}/meeting-notes", status_code=201)
async def add_meeting_note(demand_id: int, payload: DemandMeetingNoteCreate, db: DB, user: CurrentUser):
    result = await db.execute(
        select(DemandRequest).where(DemandRequest.id == demand_id, DemandRequest.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Demanda no encontrada")

    note = DemandMeetingNote(
        demand_id=demand_id, created_by_id=user.id,
        **payload.model_dump(),
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)

    db.add(DemandTimeline(
        demand_id=demand_id, user_id=user.id,
        action="comment",
        description=f"Nota de reunion agregada: {note.title}",
    ))
    await db.flush()
    return {"id": note.id}


@router.patch("/{demand_id}/meeting-notes/{note_id}")
async def update_meeting_note(demand_id: int, note_id: int, payload: DemandMeetingNoteUpdate, db: DB, user: CurrentUser):
    result = await db.execute(
        select(DemandMeetingNote).where(
            DemandMeetingNote.id == note_id,
            DemandMeetingNote.demand_id == demand_id,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Nota no encontrada")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    await db.flush()
    return {"id": note.id}


# ─── Children ────────────────────────────────────────────────────────────────

@router.get("/{demand_id}/children")
async def get_children(demand_id: int, db: DB, user: CurrentUser):
    result = await db.execute(
        select(DemandRequest)
        .where(DemandRequest.parent_demand_id == demand_id, DemandRequest.is_deleted == False)
        .options(
            selectinload(DemandRequest.created_by).selectinload(User.main_business),
            selectinload(DemandRequest.assigned_to).selectinload(User.main_business),
            selectinload(DemandRequest.vicepresidencia),
            selectinload(DemandRequest.children),
            selectinload(DemandRequest.requirements),
            selectinload(DemandRequest.timeline),
        )
        .order_by(DemandRequest.created_at)
    )
    children = result.scalars().all()
    return [_build_response(c) for c in children]
