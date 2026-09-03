"""Flujos BPMN 2.0 — CRUD de diagramas de proceso (prototipado estilo Miro)."""
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser
from app.models.flow import Flow, FlowTask

router = APIRouter(prefix="/flows", tags=["Flujos BPMN"])

# XML mínimo de un diagrama BPMN 2.0 vacío (con un evento de inicio)
EMPTY_BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
    id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Inicio"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="160" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>"""


# ─── Schemas ─────────────────────────────────────────────────────────────────

class FlowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    business_id: Optional[int] = None
    bpmn_xml: Optional[str] = None


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    project_id: Optional[int] = None
    business_id: Optional[int] = None
    bpmn_xml: Optional[str] = None
    overlays: Optional[str] = None
    thumbnail: Optional[str] = None
    is_archived: Optional[bool] = None


def _flow_summary(f: Flow) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "description": f.description,
        "project_id": f.project_id,
        "project_name": f.project.name if f.project else None,
        "business_id": f.business_id,
        "business_name": f.business.name if f.business else None,
        "thumbnail": f.thumbnail,
        "created_by": f.created_by.full_name if f.created_by else None,
        "is_archived": f.is_archived,
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "updated_at": f.updated_at.isoformat() if f.updated_at else None,
    }


def _flow_full(f: Flow) -> dict:
    data = _flow_summary(f)
    data["bpmn_xml"] = f.bpmn_xml
    data["overlays"] = f.overlays
    return data


_OPTS = [selectinload(Flow.created_by), selectinload(Flow.project), selectinload(Flow.business)]

VIEW_ALL_ROLES = ("admin", "leader", "lider_sr", "directivo")


def _can_modify(flow: Flow, user) -> bool:
    role = str(user.role.value if hasattr(user.role, "value") else user.role)
    return flow.created_by_id == user.id or role in VIEW_ALL_ROLES


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("")
async def list_flows(
    db: DB, current_user: CurrentUser,
    project_id: Optional[int] = None,
    include_archived: bool = False,
):
    from sqlalchemy import func as sa_func, cast, Integer as SAInteger
    q = select(Flow).options(*_OPTS).order_by(Flow.updated_at.desc())
    if project_id:
        q = q.where(Flow.project_id == project_id)
    if not include_archived:
        q = q.where(Flow.is_archived == False)  # noqa: E712
    flows = (await db.execute(q)).scalars().all()

    # Progreso por flujo: tareas hechas / total
    counts = {}
    rows = (await db.execute(
        select(FlowTask.flow_id, sa_func.count(FlowTask.id),
               sa_func.sum(cast(FlowTask.is_done, SAInteger)))
        .group_by(FlowTask.flow_id)
    )).all()
    for fid, total, done in rows:
        counts[fid] = (total or 0, int(done or 0))

    out = []
    for f in flows:
        d = _flow_summary(f)
        total, done = counts.get(f.id, (0, 0))
        d["tasks_total"] = total
        d["tasks_done"] = done
        d["progress_pct"] = round(done / total * 100) if total else None
        out.append(d)
    return out


@router.post("", status_code=201)
async def create_flow(payload: FlowCreate, db: DB, current_user: CurrentUser):
    flow = Flow(
        name=payload.name.strip(),
        description=payload.description,
        project_id=payload.project_id,
        business_id=payload.business_id,
        bpmn_xml=payload.bpmn_xml or EMPTY_BPMN,
        created_by_id=current_user.id,
    )
    db.add(flow)
    await db.commit()
    await db.refresh(flow)
    result = await db.execute(select(Flow).options(*_OPTS).where(Flow.id == flow.id))
    return _flow_full(result.scalar_one())


@router.get("/{flow_id}")
async def get_flow(flow_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(select(Flow).options(*_OPTS).where(Flow.id == flow_id))
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Flujo no encontrado")
    return _flow_full(flow)


@router.patch("/{flow_id}")
async def update_flow(flow_id: int, payload: FlowUpdate, db: DB, current_user: CurrentUser):
    result = await db.execute(select(Flow).options(*_OPTS).where(Flow.id == flow_id))
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Flujo no encontrado")
    if not _can_modify(flow, current_user):
        raise HTTPException(403, "Solo el creador del flujo o un líder puede modificarlo")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(flow, field, value)
    flow.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(flow)
    return _flow_full(flow)


@router.post("/{flow_id}/duplicate", status_code=201)
async def duplicate_flow(flow_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(select(Flow).where(Flow.id == flow_id))
    src = result.scalar_one_or_none()
    if not src:
        raise HTTPException(404, "Flujo no encontrado")
    copy = Flow(
        name=f"{src.name} (copia)",
        description=src.description,
        project_id=src.project_id,
        business_id=src.business_id,
        bpmn_xml=src.bpmn_xml,
        overlays=src.overlays,
        thumbnail=src.thumbnail,
        created_by_id=current_user.id,
    )
    db.add(copy)
    await db.commit()
    await db.refresh(copy)
    result = await db.execute(select(Flow).options(*_OPTS).where(Flow.id == copy.id))
    return _flow_full(result.scalar_one())


# ─── Tareas del flujo (checklist con responsable y % de avance) ──────────────

import json as _json


class FlowTaskCreate(BaseModel):
    title: str
    responsible_id: Optional[int] = None
    participants: Optional[list] = None


class FlowTaskUpdate(BaseModel):
    title: Optional[str] = None
    responsible_id: Optional[int] = None
    participants: Optional[list] = None
    is_done: Optional[bool] = None
    order_index: Optional[int] = None


def _ftask(t: FlowTask) -> dict:
    try:
        participants = _json.loads(t.participants) if t.participants else []
    except Exception:
        participants = []
    return {
        "id": t.id,
        "flow_id": t.flow_id,
        "title": t.title,
        "responsible_id": t.responsible_id,
        "responsible": t.responsible.full_name if t.responsible else None,
        "participants": participants,
        "is_done": t.is_done,
        "order_index": t.order_index,
    }


@router.get("/{flow_id}/tasks")
async def list_flow_tasks(flow_id: int, db: DB, current_user: CurrentUser):
    tasks = (await db.execute(
        select(FlowTask).options(selectinload(FlowTask.responsible))
        .where(FlowTask.flow_id == flow_id)
        .order_by(FlowTask.is_done, FlowTask.order_index, FlowTask.id)
    )).scalars().all()
    total = len(tasks)
    done = sum(1 for t in tasks if t.is_done)
    return {
        "tasks": [_ftask(t) for t in tasks],
        "total": total,
        "done": done,
        "progress_pct": round(done / total * 100) if total else 0,
    }


@router.post("/{flow_id}/tasks", status_code=201)
async def create_flow_task(flow_id: int, payload: FlowTaskCreate, db: DB, current_user: CurrentUser):
    flow = (await db.execute(select(Flow).where(Flow.id == flow_id))).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Flujo no encontrado")
    t = FlowTask(
        flow_id=flow_id,
        title=payload.title.strip(),
        responsible_id=payload.responsible_id,
        participants=_json.dumps(payload.participants) if payload.participants else None,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    row = (await db.execute(
        select(FlowTask).options(selectinload(FlowTask.responsible)).where(FlowTask.id == t.id)
    )).scalar_one()
    return _ftask(row)


@router.patch("/{flow_id}/tasks/{task_id}")
async def update_flow_task(flow_id: int, task_id: int, payload: FlowTaskUpdate, db: DB, current_user: CurrentUser):
    t = (await db.execute(
        select(FlowTask).options(selectinload(FlowTask.responsible)).where(FlowTask.id == task_id)
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tarea de flujo no encontrada")
    data = payload.model_dump(exclude_unset=True)
    if "participants" in data:
        data["participants"] = _json.dumps(data["participants"]) if data["participants"] else None
    for f, v in data.items():
        setattr(t, f, v)
    await db.commit()
    await db.refresh(t)
    return _ftask(t)


@router.delete("/{flow_id}/tasks/{task_id}")
async def delete_flow_task(flow_id: int, task_id: int, db: DB, current_user: CurrentUser):
    t = (await db.execute(select(FlowTask).where(FlowTask.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tarea de flujo no encontrada")
    await db.delete(t)
    await db.commit()
    return {"ok": True}


@router.delete("/{flow_id}")
async def delete_flow(flow_id: int, db: DB, current_user: CurrentUser):
    """Archivado (soft delete) — el diagrama se conserva en BD."""
    result = await db.execute(select(Flow).where(Flow.id == flow_id))
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Flujo no encontrado")
    if not _can_modify(flow, current_user):
        raise HTTPException(403, "Solo el creador del flujo o un líder puede archivarlo")
    flow.is_archived = True
    await db.commit()
    return {"ok": True}
