"""Voice Notes router — notas de voz transcribibles y asignables."""
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.voice_note import VoiceNote
from app.models.user import User

router = APIRouter(prefix="/voice-notes", tags=["voice-notes"])


class VoiceNoteCreate(BaseModel):
    transcript: str
    title: Optional[str] = None
    assigned_to_id: Optional[int] = None
    project_id: Optional[int] = None
    task_id: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: str = "media"
    meeting_id: Optional[int] = None
    chunk_id: Optional[int] = None
    audio_duration_s: Optional[float] = None


class VoiceNoteUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    assigned_to_id: Optional[int] = None
    project_id: Optional[int] = None
    task_id: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    is_done: Optional[bool] = None


@router.get("", response_model=List[dict])
async def list_voice_notes(
    status: Optional[str] = None,
    include_done: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(VoiceNote).where(VoiceNote.user_id == current_user.id)
    if not include_done:
        q = q.where(VoiceNote.is_done == False)
    if status:
        q = q.where(VoiceNote.status == status)
    q = q.order_by(desc(VoiceNote.created_at))
    result = await db.execute(q)
    notes = result.scalars().all()
    return [_note_to_dict(n) for n in notes]


@router.post("", response_model=dict)
async def create_voice_note(
    data: VoiceNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = VoiceNote(
        user_id=current_user.id,
        transcript=data.transcript,
        title=data.title or data.transcript[:80],
        assigned_to_id=data.assigned_to_id,
        project_id=data.project_id,
        task_id=data.task_id,
        due_date=data.due_date,
        priority=data.priority,
        meeting_id=data.meeting_id,
        chunk_id=data.chunk_id,
        audio_duration_s=data.audio_duration_s,
        status="asignada" if data.assigned_to_id else "pendiente",
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _note_to_dict(note)


@router.patch("/{note_id}", response_model=dict)
async def update_voice_note(
    note_id: int,
    data: VoiceNoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = await db.get(VoiceNote, note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(note, field, val)
    if data.is_done:
        note.done_at = datetime.utcnow()
        note.status = "completada"
    note.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(note)
    return _note_to_dict(note)


@router.delete("/{note_id}", status_code=204)
async def delete_voice_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = await db.get(VoiceNote, note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    await db.delete(note)
    await db.commit()


def _note_to_dict(n: VoiceNote) -> dict:
    return {
        "id": n.id,
        "user_id": n.user_id,
        "transcript": n.transcript,
        "title": n.title,
        "status": n.status,
        "assigned_to_id": n.assigned_to_id,
        "project_id": n.project_id,
        "task_id": n.task_id,
        "due_date": n.due_date.isoformat() if n.due_date else None,
        "priority": n.priority,
        "meeting_id": n.meeting_id,
        "chunk_id": n.chunk_id,
        "audio_duration_s": n.audio_duration_s,
        "is_done": n.is_done,
        "done_at": n.done_at.isoformat() if n.done_at else None,
        "created_at": n.created_at.isoformat(),
    }
