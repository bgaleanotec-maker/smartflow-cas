"""Documentación por proyecto — secciones markdown + export consolidado para IA."""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser
from app.models.project_doc import ProjectDoc
from app.models.project import Project
from app.models.flow import Flow

router = APIRouter(prefix="/project-docs", tags=["Documentación de Proyectos"])


class DocCreate(BaseModel):
    project_id: int
    title: str
    content: Optional[str] = None


class DocUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    order_index: Optional[int] = None


def _doc(d: ProjectDoc, full: bool = True) -> dict:
    data = {
        "id": d.id,
        "project_id": d.project_id,
        "title": d.title,
        "order_index": d.order_index,
        "updated_by": d.updated_by.full_name if d.updated_by else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }
    if full:
        data["content"] = d.content
    return data


@router.get("/project/{project_id}")
async def list_docs(project_id: int, db: DB, current_user: CurrentUser):
    docs = (await db.execute(
        select(ProjectDoc).options(selectinload(ProjectDoc.updated_by))
        .where(ProjectDoc.project_id == project_id)
        .order_by(ProjectDoc.order_index, ProjectDoc.id)
    )).scalars().all()
    return [_doc(d, full=False) for d in docs]


@router.post("", status_code=201)
async def create_doc(payload: DocCreate, db: DB, current_user: CurrentUser):
    max_order = (await db.execute(
        select(ProjectDoc.order_index).where(ProjectDoc.project_id == payload.project_id)
        .order_by(ProjectDoc.order_index.desc()).limit(1)
    )).scalar() or 0
    doc = ProjectDoc(
        project_id=payload.project_id,
        title=payload.title.strip(),
        content=payload.content or "",
        order_index=max_order + 1,
        updated_by_id=current_user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc(doc)


@router.get("/{doc_id}")
async def get_doc(doc_id: int, db: DB, current_user: CurrentUser):
    doc = (await db.execute(
        select(ProjectDoc).options(selectinload(ProjectDoc.updated_by))
        .where(ProjectDoc.id == doc_id)
    )).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    return _doc(doc)


@router.patch("/{doc_id}")
async def update_doc(doc_id: int, payload: DocUpdate, db: DB, current_user: CurrentUser):
    doc = (await db.execute(
        select(ProjectDoc).where(ProjectDoc.id == doc_id)
    )).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    doc.updated_by_id = current_user.id
    await db.commit()
    await db.refresh(doc)
    return _doc(doc)


@router.delete("/{doc_id}")
async def delete_doc(doc_id: int, db: DB, current_user: CurrentUser):
    doc = (await db.execute(
        select(ProjectDoc).where(ProjectDoc.id == doc_id)
    )).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    await db.delete(doc)
    await db.commit()
    return {"ok": True}


@router.get("/project/{project_id}/export")
async def export_docs(
    project_id: int, db: DB, current_user: CurrentUser,
    include_flows_xml: bool = False,
):
    """Export consolidado del proyecto para consumo por IA (JSON estructurado):
    proyecto + toda la documentación markdown + flujos BPMN asociados.
    Úsalo desde tu API de IA: GET /api/v1/project-docs/project/{id}/export
    con header Authorization: Bearer <token>."""
    project = (await db.execute(
        select(Project).where(Project.id == project_id)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Proyecto no encontrado")

    docs = (await db.execute(
        select(ProjectDoc).where(ProjectDoc.project_id == project_id)
        .order_by(ProjectDoc.order_index, ProjectDoc.id)
    )).scalars().all()

    flows = (await db.execute(
        select(Flow).where(Flow.project_id == project_id, Flow.is_archived == False)  # noqa: E712
    )).scalars().all()

    # Markdown consolidado (listo para dárselo a un LLM como contexto)
    md_parts = [f"# Proyecto: {project.name}\n"]
    if project.description:
        md_parts.append(f"{project.description}\n")
    for d in docs:
        md_parts.append(f"\n## {d.title}\n\n{d.content or ''}")
    if flows:
        md_parts.append("\n## Flujos de proceso (BPMN)\n")
        for f in flows:
            md_parts.append(f"- {f.name}" + (f": {f.description}" if f.description else ""))
    consolidated_md = "\n".join(md_parts)

    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "status": str(project.status) if project.status else None,
        },
        "docs": [{"title": d.title, "content": d.content, "updated_at": d.updated_at.isoformat() if d.updated_at else None} for d in docs],
        "flows": [
            {
                "id": f.id,
                "name": f.name,
                "description": f.description,
                **({"bpmn_xml": f.bpmn_xml} if include_flows_xml else {}),
            }
            for f in flows
        ],
        "consolidated_markdown": consolidated_md,
    }
