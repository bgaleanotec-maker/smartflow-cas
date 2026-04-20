"""
Quick reminders router — lightweight notes/todos for mobile.
Endpoints:
  GET    /reminders                    — list my reminders (pending first, done last)
  POST   /reminders                    — create reminder
  PATCH  /reminders/{id}               — update (mark done, edit title, etc.)
  DELETE /reminders/{id}               — delete
  POST   /reminders/trigger-whatsapp   — manual trigger for admins (testing)
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DB, CurrentUser, LeaderOrAdmin
from app.models.reminder import Reminder

router = APIRouter(prefix="/reminders", tags=["Reminders"])


class ReminderCreate(BaseModel):
    title: str
    note: Optional[str] = None
    priority: str = "media"
    due_date: Optional[datetime] = None
    linked_type: Optional[str] = None
    linked_id: Optional[int] = None


class ReminderUpdate(BaseModel):
    title: Optional[str] = None
    note: Optional[str] = None
    priority: Optional[str] = None
    is_done: Optional[bool] = None
    due_date: Optional[datetime] = None


def _to_dict(r: Reminder) -> dict:
    return {
        "id": r.id,
        "title": r.title,
        "note": r.note,
        "priority": r.priority,
        "is_done": r.is_done,
        "due_date": r.due_date.isoformat() if r.due_date else None,
        "done_at": r.done_at.isoformat() if r.done_at else None,
        "linked_type": r.linked_type,
        "linked_id": r.linked_id,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("")
async def list_reminders(db: DB, user: CurrentUser, include_done: bool = False):
    """List reminders for the current user. Pending first, ordered by due_date then created_at."""
    q = select(Reminder).where(Reminder.user_id == user.id)
    if not include_done:
        q = q.where(Reminder.is_done == False)
    q = q.order_by(Reminder.is_done, Reminder.due_date.asc().nulls_last(), Reminder.created_at.desc())
    result = await db.execute(q)
    items = result.scalars().all()
    return [_to_dict(r) for r in items]


@router.post("", status_code=201)
async def create_reminder(body: ReminderCreate, db: DB, user: CurrentUser):
    r = Reminder(
        user_id=user.id,
        title=body.title.strip(),
        note=body.note,
        priority=body.priority,
        due_date=body.due_date,
        linked_type=body.linked_type,
        linked_id=body.linked_id,
    )
    db.add(r)
    await db.flush()
    await db.refresh(r)
    return _to_dict(r)


@router.patch("/{reminder_id}")
async def update_reminder(reminder_id: int, body: ReminderUpdate, db: DB, user: CurrentUser):
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == user.id)
    )
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Recordatorio no encontrado")

    if body.title is not None:
        r.title = body.title.strip()
    if body.note is not None:
        r.note = body.note
    if body.priority is not None:
        r.priority = body.priority
    if body.due_date is not None:
        r.due_date = body.due_date
    if body.is_done is not None:
        r.is_done = body.is_done
        r.done_at = datetime.now(timezone.utc) if body.is_done else None

    await db.flush()
    await db.refresh(r)
    return _to_dict(r)


@router.delete("/{reminder_id}", status_code=204)
async def delete_reminder(reminder_id: int, db: DB, user: CurrentUser):
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == user.id)
    )
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Recordatorio no encontrado")
    await db.delete(r)


# ─── Admin: manual WhatsApp reminder trigger ──────────────────────────────────

@router.post("/trigger-whatsapp", status_code=200)
async def trigger_whatsapp_reminders(
    admin: LeaderOrAdmin,
    afternoon: bool = False,
):
    """
    Trigger WhatsApp task reminders immediately (admin/leader only).
    Use afternoon=true to simulate the 3 PM lider_sr-only run.
    """
    from app.services.task_reminders import send_daily_reminders
    import asyncio

    # Run in background so the HTTP response returns immediately
    asyncio.create_task(send_daily_reminders(is_afternoon=afternoon))
    run_type = "tarde (lider_sr)" if afternoon else "mañana (todos)"
    return {
        "message": f"Recordatorios WhatsApp en proceso — run: {run_type}",
        "afternoon": afternoon,
    }
