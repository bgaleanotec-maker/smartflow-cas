"""Comentarios en tareas y proyectos + push al responsable.
Cualquiera comenta; el push (notificación in-app + WhatsApp) es de
líderes / SR / admin — 'hazlo ejecutar' con seguimiento."""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser
from app.models.comment import WorkComment

router = APIRouter(prefix="/comments", tags=["Comentarios"])

PUSH_ROLES = ("admin", "leader", "lider_sr", "directivo")


class CommentCreate(BaseModel):
    content: str
    task_id: Optional[int] = None
    project_id: Optional[int] = None
    push: bool = False   # notificar al responsable (solo líderes)


def _dict(c: WorkComment) -> dict:
    return {
        "id": c.id,
        "task_id": c.task_id,
        "project_id": c.project_id,
        "content": c.content,
        "is_push": c.is_push,
        "author": c.user.full_name if c.user else "—",
        "author_id": c.user_id,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("")
async def list_comments(
    db: DB, current_user: CurrentUser,
    task_id: Optional[int] = None,
    project_id: Optional[int] = None,
):
    if not task_id and not project_id:
        raise HTTPException(400, "Indica task_id o project_id")
    q = select(WorkComment).options(selectinload(WorkComment.user))
    if task_id:
        q = q.where(WorkComment.task_id == task_id)
    else:
        q = q.where(WorkComment.project_id == project_id, WorkComment.task_id == None)  # noqa: E711
    rows = (await db.execute(q.order_by(WorkComment.created_at))).scalars().all()
    return [_dict(c) for c in rows]


@router.post("", status_code=201)
async def create_comment(payload: CommentCreate, db: DB, current_user: CurrentUser):
    if not payload.content.strip():
        raise HTTPException(400, "El comentario está vacío")
    if not payload.task_id and not payload.project_id:
        raise HTTPException(400, "Indica task_id o project_id")

    role = str(current_user.role.value if hasattr(current_user.role, "value") else current_user.role)
    do_push = payload.push and role in PUSH_ROLES

    c = WorkComment(
        content=payload.content.strip(),
        task_id=payload.task_id,
        project_id=payload.project_id,
        user_id=current_user.id,
        is_push=do_push,
    )
    db.add(c)
    await db.flush()

    push_result = None
    if do_push:
        push_result = await _notify_responsible(db, payload, current_user, c.content)

    await db.commit()
    row = (await db.execute(
        select(WorkComment).options(selectinload(WorkComment.user)).where(WorkComment.id == c.id)
    )).scalar_one()
    out = _dict(row)
    out["push_result"] = push_result
    return out


async def _notify_responsible(db, payload: CommentCreate, sender, content: str):
    """Crea notificación in-app y envía WhatsApp al responsable (si tiene teléfono)."""
    from app.models.notification import Notification
    from app.models.user import User

    target = None
    context = ""
    if payload.task_id:
        from app.models.task import Task
        t = (await db.execute(
            select(Task).options(selectinload(Task.assignee), selectinload(Task.reporter), selectinload(Task.project))
            .where(Task.id == payload.task_id)
        )).scalar_one_or_none()
        if t:
            target = t.assignee or t.reporter
            context = f"la tarea '{t.title}'" + (f" del proyecto {t.project.name}" if t.project else "")
    elif payload.project_id:
        from app.models.project import Project
        p = (await db.execute(
            select(Project).options(selectinload(Project.leader)).where(Project.id == payload.project_id)
        )).scalar_one_or_none()
        if p:
            target = p.leader
            context = f"el proyecto '{p.name}'"

    if not target:
        return {"notified": False, "reason": "Sin responsable asignado"}
    if target.id == sender.id:
        return {"notified": False, "reason": "El responsable eres tú"}

    # In-app
    db.add(Notification(
        user_id=target.id,
        title=f"📣 {sender.full_name} te dejó indicaciones",
        message=f"En {context}: {content[:300]}",
        notification_type="mention",
        entity_type="task" if payload.task_id else "project",
        entity_id=payload.task_id or payload.project_id,
    ))

    # WhatsApp (falla en silencio si Ultra no está configurado)
    wa_sent = False
    if target.phone:
        from app.services.whatsapp import send_whatsapp
        msg = (
            f"📣 *SmartFlow — indicación de {sender.full_name}*\n\n"
            f"Sobre {context}:\n_{content[:400]}_\n\n"
            f"Revisa y ejecuta 💪 → https://smartflow-casbo.onrender.com"
        )
        try:
            wa_sent = await send_whatsapp(target.phone, msg)
        except Exception:
            wa_sent = False

    return {"notified": True, "target": target.full_name, "whatsapp": wa_sent}


@router.delete("/{comment_id}")
async def delete_comment(comment_id: int, db: DB, current_user: CurrentUser):
    c = (await db.execute(select(WorkComment).where(WorkComment.id == comment_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Comentario no encontrado")
    role = str(current_user.role.value if hasattr(current_user.role, "value") else current_user.role)
    if c.user_id != current_user.id and role not in PUSH_ROLES:
        raise HTTPException(403, "Solo el autor o un líder puede eliminarlo")
    await db.delete(c)
    await db.commit()
    return {"ok": True}
