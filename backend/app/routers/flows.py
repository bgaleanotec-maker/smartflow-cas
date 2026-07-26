"""Flujos BPMN 2.0 — CRUD de diagramas de proceso (prototipado estilo Miro)."""
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser
from app.models.flow import Flow

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


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("")
async def list_flows(
    db: DB, current_user: CurrentUser,
    project_id: Optional[int] = None,
    include_archived: bool = False,
):
    q = select(Flow).options(*_OPTS).order_by(Flow.updated_at.desc())
    if project_id:
        q = q.where(Flow.project_id == project_id)
    if not include_archived:
        q = q.where(Flow.is_archived == False)  # noqa: E712
    flows = (await db.execute(q)).scalars().all()
    return [_flow_summary(f) for f in flows]


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


@router.delete("/{flow_id}")
async def delete_flow(flow_id: int, db: DB, current_user: CurrentUser):
    """Archivado (soft delete) — el diagrama se conserva en BD."""
    result = await db.execute(select(Flow).where(Flow.id == flow_id))
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Flujo no encontrado")
    flow.is_archived = True
    await db.commit()
    return {"ok": True}
