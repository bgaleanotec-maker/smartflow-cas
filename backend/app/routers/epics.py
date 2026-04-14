from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.deps import DB, CurrentUser
from app.models.epic import SmartEpic, Story, StoryUpdate
from app.models.user import User
from app.schemas.epic import (
    EpicCreate, EpicUpdate, EpicResponse,
    StoryCreate, StoryUpdateSchema, StoryResponse,
    StoryUpdateCreate, StoryUpdateResponse
)

router = APIRouter(prefix="/epics", tags=["Épicas e Historias"])


def epic_opts():
    return [selectinload(SmartEpic.owner).selectinload(User.main_business), selectinload(SmartEpic.stories).options(
        selectinload(Story.assigned_to).selectinload(User.main_business),
        selectinload(Story.updates).selectinload(StoryUpdate.user).selectinload(User.main_business)
    )]


@router.get("", response_model=List[EpicResponse])
async def list_epics(
    db: DB, current_user: CurrentUser,
    project_id: Optional[int] = None,
    status: Optional[str] = None,
):
    q = select(SmartEpic).options(*epic_opts())
    if project_id: q = q.where(SmartEpic.project_id == project_id)
    if status: q = q.where(SmartEpic.status == status)
    q = q.order_by(SmartEpic.created_at.desc())
    return (await db.execute(q)).scalars().all()


@router.post("", response_model=EpicResponse, status_code=201)
async def create_epic(payload: EpicCreate, db: DB, current_user: CurrentUser):
    epic = SmartEpic(**payload.model_dump(), created_by_id=current_user.id)
    db.add(epic)
    await db.flush()
    result = await db.execute(select(SmartEpic).options(*epic_opts()).where(SmartEpic.id == epic.id))
    return result.scalar_one()


@router.get("/{epic_id}", response_model=EpicResponse)
async def get_epic(epic_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(select(SmartEpic).options(*epic_opts()).where(SmartEpic.id == epic_id))
    epic = result.scalar_one_or_none()
    if not epic: raise HTTPException(404, "Épica no encontrada")
    return epic


@router.patch("/{epic_id}", response_model=EpicResponse)
async def update_epic(epic_id: int, payload: EpicUpdate, db: DB, current_user: CurrentUser):
    result = await db.execute(select(SmartEpic).where(SmartEpic.id == epic_id))
    epic = result.scalar_one_or_none()
    if not epic: raise HTTPException(404)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(epic, k, v)
    await db.flush()
    result = await db.execute(select(SmartEpic).options(*epic_opts()).where(SmartEpic.id == epic_id))
    return result.scalar_one()


@router.delete("/{epic_id}", status_code=204)
async def delete_epic(epic_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(select(SmartEpic).where(SmartEpic.id == epic_id))
    epic = result.scalar_one_or_none()
    if not epic: raise HTTPException(404)
    await db.delete(epic)


# ─── Stories under an epic ────────────────────────────────────────────────────

@router.post("/{epic_id}/stories", response_model=StoryResponse, status_code=201)
async def create_story(epic_id: int, payload: StoryCreate, db: DB, current_user: CurrentUser):
    # exclude epic_id from dump — it's already provided explicitly to avoid duplicate kwarg
    story = Story(**payload.model_dump(exclude={'epic_id'}), epic_id=epic_id, created_by_id=current_user.id)
    db.add(story)
    await db.flush()
    result = await db.execute(
        select(Story).options(selectinload(Story.assigned_to).selectinload(User.main_business), selectinload(Story.updates).selectinload(StoryUpdate.user).selectinload(User.main_business))
        .where(Story.id == story.id)
    )
    return result.scalar_one()


# ─── Standalone stories router ────────────────────────────────────────────────

router2 = APIRouter(prefix="/stories", tags=["Historias"])


@router2.get("", response_model=List[StoryResponse])
async def list_stories(
    db: DB, current_user: CurrentUser,
    project_id: Optional[int] = None,
    epic_id: Optional[int] = None,
    status: Optional[str] = None,
    is_blocking: Optional[bool] = None,
):
    opts = [selectinload(Story.assigned_to).selectinload(User.main_business), selectinload(Story.updates).selectinload(StoryUpdate.user).selectinload(User.main_business)]
    q = select(Story).options(*opts)
    if project_id: q = q.where(Story.project_id == project_id)
    if epic_id: q = q.where(Story.epic_id == epic_id)
    if status: q = q.where(Story.status == status)
    if is_blocking is not None: q = q.where(Story.is_blocking == is_blocking)
    q = q.order_by(Story.order, Story.created_at.desc())
    return (await db.execute(q)).scalars().all()


@router2.patch("/{story_id}", response_model=StoryResponse)
async def update_story(story_id: int, payload: StoryUpdateSchema, db: DB, current_user: CurrentUser):
    result = await db.execute(select(Story).where(Story.id == story_id))
    story = result.scalar_one_or_none()
    if not story: raise HTTPException(404)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(story, k, v)
    await db.flush()
    opts = [selectinload(Story.assigned_to).selectinload(User.main_business), selectinload(Story.updates).selectinload(StoryUpdate.user).selectinload(User.main_business)]
    result = await db.execute(select(Story).options(*opts).where(Story.id == story_id))
    return result.scalar_one()


@router2.delete("/{story_id}", status_code=204)
async def delete_story(story_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(select(Story).where(Story.id == story_id))
    story = result.scalar_one_or_none()
    if not story: raise HTTPException(404)
    await db.delete(story)


@router2.post("/{story_id}/updates", response_model=StoryUpdateResponse, status_code=201)
async def add_story_update(story_id: int, payload: StoryUpdateCreate, db: DB, current_user: CurrentUser):
    update = StoryUpdate(
        story_id=story_id,
        user_id=current_user.id,
        content=payload.content,
        update_type=payload.update_type,
    )
    db.add(update)
    # Auto-update story status if type is bloqueo/desbloqueo/entrega
    result = await db.execute(select(Story).where(Story.id == story_id))
    story = result.scalar_one_or_none()
    if story:
        if payload.update_type == "bloqueo":
            story.status = "bloqueada"
            story.is_blocking = True
        elif payload.update_type == "desbloqueo":
            story.is_blocking = False
            if story.status == "bloqueada":
                story.status = "en_progreso"
        elif payload.update_type == "entrega":
            story.status = "completada"
    await db.flush()
    opts = [selectinload(StoryUpdate.user).selectinload(User.main_business)]
    result = await db.execute(select(StoryUpdate).options(*opts).where(StoryUpdate.id == update.id))
    return result.scalar_one()
