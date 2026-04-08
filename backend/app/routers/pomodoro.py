from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Query
from sqlalchemy import select, update, func
from app.core.deps import DB, CurrentUser
from app.models.pomodoro import PomodoroSession, SessionType
from app.models.task import Task
from pydantic import BaseModel

router = APIRouter(prefix="/pomodoro", tags=["Pomodoro"])


class StartSessionRequest(BaseModel):
    task_id: Optional[int] = None
    duration_minutes: int = 25
    session_type: SessionType = SessionType.WORK


class PomodoroSessionResponse(BaseModel):
    id: int
    task_id: Optional[int]
    session_type: SessionType
    duration_minutes: int
    started_at: datetime
    ended_at: Optional[datetime]
    is_completed: bool
    was_interrupted: bool
    notes: Optional[str]

    class Config:
        from_attributes = True


@router.post("/start", response_model=PomodoroSessionResponse, status_code=201)
async def start_session(payload: StartSessionRequest, db: DB, current_user: CurrentUser):
    # Check if there's an active session and interrupt it
    existing = await db.execute(
        select(PomodoroSession).where(
            PomodoroSession.user_id == current_user.id,
            PomodoroSession.is_completed == False,
            PomodoroSession.ended_at == None,
        )
    )
    active = existing.scalar_one_or_none()
    if active:
        active.ended_at = datetime.now(timezone.utc)
        active.was_interrupted = True
        active.is_completed = False

    session = PomodoroSession(
        user_id=current_user.id,
        task_id=payload.task_id,
        session_type=payload.session_type,
        duration_minutes=payload.duration_minutes,
        started_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


@router.post("/{session_id}/complete", response_model=PomodoroSessionResponse)
async def complete_session(
    session_id: int, notes: Optional[str] = None, db: DB = None, current_user: CurrentUser = None
):
    result = await db.execute(
        select(PomodoroSession).where(
            PomodoroSession.id == session_id,
            PomodoroSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    session.ended_at = datetime.now(timezone.utc)
    session.is_completed = True
    if notes:
        session.notes = notes

    # Update logged hours on task
    if session.task_id and session.session_type == SessionType.WORK:
        task_result = await db.execute(select(Task).where(Task.id == session.task_id))
        task = task_result.scalar_one_or_none()
        if task:
            task.logged_hours = (task.logged_hours or 0) + (session.duration_minutes / 60)

    await db.flush()
    await db.refresh(session)
    return session


@router.post("/{session_id}/interrupt", response_model=PomodoroSessionResponse)
async def interrupt_session(session_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(
        select(PomodoroSession).where(
            PomodoroSession.id == session_id,
            PomodoroSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    session.ended_at = datetime.now(timezone.utc)
    session.was_interrupted = True
    session.is_completed = False
    await db.flush()
    await db.refresh(session)
    return session


@router.get("/my-sessions", response_model=List[PomodoroSessionResponse])
async def get_my_sessions(
    db: DB,
    current_user: CurrentUser,
    task_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
):
    query = (
        select(PomodoroSession)
        .where(PomodoroSession.user_id == current_user.id)
        .order_by(PomodoroSession.started_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if task_id:
        query = query.where(PomodoroSession.task_id == task_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/stats")
async def get_pomodoro_stats(db: DB, current_user: CurrentUser):
    from datetime import timedelta
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())

    total_today = await db.execute(
        select(func.count(PomodoroSession.id)).where(
            PomodoroSession.user_id == current_user.id,
            PomodoroSession.session_type == SessionType.WORK,
            PomodoroSession.is_completed == True,
            func.date(PomodoroSession.started_at) == today,
        )
    )
    total_week = await db.execute(
        select(func.count(PomodoroSession.id)).where(
            PomodoroSession.user_id == current_user.id,
            PomodoroSession.session_type == SessionType.WORK,
            PomodoroSession.is_completed == True,
            func.date(PomodoroSession.started_at) >= week_start,
        )
    )
    total_minutes = await db.execute(
        select(func.sum(PomodoroSession.duration_minutes)).where(
            PomodoroSession.user_id == current_user.id,
            PomodoroSession.session_type == SessionType.WORK,
            PomodoroSession.is_completed == True,
            func.date(PomodoroSession.started_at) == today,
        )
    )

    return {
        "pomodoros_today": total_today.scalar() or 0,
        "pomodoros_this_week": total_week.scalar() or 0,
        "minutes_focused_today": total_minutes.scalar() or 0,
    }
