from typing import Optional, List
from fastapi import APIRouter, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.deps import DB, CurrentUser, LeaderOrAdmin
from app.models.project import Project, project_members_table
from app.models.user import User, UserRole
from app.models.task import Task
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse

router = APIRouter(prefix="/projects", tags=["Proyectos"])


@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    db: DB,
    current_user: CurrentUser,
    status: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
):
    query = (
        select(Project)
        .options(
            selectinload(Project.leader),
            selectinload(Project.members),
        )
        .where(Project.is_deleted == False)
        .offset(skip)
        .limit(limit)
    )

    # Filter by access: admin/leaders see all; members only see their projects
    if current_user.role == UserRole.MEMBER:
        query = query.where(
            (Project.is_private == False) |
            (Project.leader_id == current_user.id) |
            Project.id.in_(
                select(project_members_table.c.project_id).where(
                    project_members_table.c.user_id == current_user.id
                )
            )
        )

    if status:
        query = query.where(Project.status == status)
    if search:
        query = query.where(Project.name.ilike(f"%{search}%"))

    result = await db.execute(query)
    projects = result.scalars().all()
    return projects


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(payload: ProjectCreate, db: DB, current_user: LeaderOrAdmin):
    project = Project(
        name=payload.name,
        description=payload.description,
        business_id=payload.business_id,
        leader_id=payload.leader_id or current_user.id,
        priority_id=payload.priority_id,
        status=payload.status,
        start_date=payload.start_date,
        due_date=payload.due_date,
        is_private=payload.is_private,
        color=payload.color,
        tags=payload.tags,
        created_by_id=current_user.id,
    )
    db.add(project)
    await db.flush()

    # Add members
    if payload.member_ids:
        for uid in payload.member_ids:
            await db.execute(
                project_members_table.insert().values(
                    project_id=project.id, user_id=uid
                )
            )

    # Reload with eager-loaded relationships to avoid async lazy-load error
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.leader),
            selectinload(Project.members),
        )
        .where(Project.id == project.id)
    )
    project = result.scalar_one()
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.leader),
            selectinload(Project.members),
            selectinload(Project.epics),
            selectinload(Project.sprints),
        )
        .where(Project.id == project_id, Project.is_deleted == False)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int, payload: ProjectUpdate, db: DB, current_user: LeaderOrAdmin
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    # Only leader or admin can update
    if current_user.role == UserRole.LEADER and project.leader_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el líder del proyecto puede editarlo")

    update_data = payload.model_dump(exclude_unset=True, exclude={"member_ids"})
    for field, value in update_data.items():
        setattr(project, field, value)

    if payload.member_ids is not None:
        # Update members: clear and re-add
        await db.execute(
            project_members_table.delete().where(
                project_members_table.c.project_id == project_id
            )
        )
        for uid in payload.member_ids:
            await db.execute(
                project_members_table.insert().values(
                    project_id=project_id, user_id=uid
                )
            )

    await db.flush()
    # Reload with eager-loaded relationships to avoid async lazy-load error
    result2 = await db.execute(
        select(Project)
        .options(
            selectinload(Project.leader),
            selectinload(Project.members),
        )
        .where(Project.id == project_id)
    )
    project = result2.scalar_one()
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: int, db: DB, current_user: LeaderOrAdmin):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    project.is_deleted = True
    await db.flush()
