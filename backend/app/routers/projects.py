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
            selectinload(Project.leader).selectinload(User.main_business),
            selectinload(Project.members).selectinload(User.main_business),
        )
        .where(Project.is_deleted == False)
        .offset(skip)
        .limit(limit)
    )

    # Acceso: admin / leader / lider_sr / directivo ven todo;
    # member / herramientas / negocio SOLO donde participan (líder o miembro)
    basic_roles = (UserRole.MEMBER, UserRole.HERRAMIENTAS, UserRole.NEGOCIO)
    if current_user.role in basic_roles:
        query = query.where(
            (Project.leader_id == current_user.id) |
            Project.id.in_(
                select(project_members_table.c.project_id).where(
                    project_members_table.c.user_id == current_user.id
                )
            )
        )

    if status:
        # El filtro llega como valor ("activo"); la columna Enum compara por miembro
        from app.models.project import ProjectStatus
        try:
            status_enum = ProjectStatus(status)
            query = query.where(Project.status == status_enum)
        except ValueError:
            pass  # estado desconocido: no filtrar
    if search:
        query = query.where(Project.name.ilike(f"%{search}%"))

    result = await db.execute(query)
    projects = result.scalars().all()
    return projects


@router.get("/{project_id}/analytics")
async def project_analytics(project_id: int, db: DB, current_user: CurrentUser):
    """Avance ponderado del proyecto: cada tarea aporta según su peso (1-5)
    y su % de avance. Visible para todos los que pueden ver el proyecto."""
    from app.models.task import Task

    result = await db.execute(
        select(Project)
        .options(selectinload(Project.members), selectinload(Project.leader))
        .where(Project.id == project_id, Project.is_deleted == False)  # noqa: E712
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    # Roles básicos: solo si participan en el proyecto
    basic_roles = (UserRole.MEMBER, UserRole.HERRAMIENTAS, UserRole.NEGOCIO)
    if current_user.role in basic_roles:
        member_ids = [m.id for m in (project.members or [])]
        if current_user.id != project.leader_id and current_user.id not in member_ids:
            raise HTTPException(status_code=403, detail="No participas en este proyecto")

    tasks = (await db.execute(
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.status))
        .where(Task.project_id == project_id, Task.is_deleted == False)  # noqa: E712
        .order_by(Task.order_index, Task.id)
    )).scalars().all()

    rows = []
    total_weight = 0
    weighted_sum = 0.0
    for t in tasks:
        is_done = bool(t.status and t.status.is_done_state)
        pct = 100 if is_done else max(0, min(100, t.progress_pct or 0))
        w = max(1, min(5, t.weight or 1))
        total_weight += w
        weighted_sum += w * pct
        rows.append({
            "id": t.id,
            "title": t.title,
            "assignee": t.assignee.full_name if t.assignee else None,
            "assignee_id": t.assignee_id,
            "status": t.status.name if t.status else "Por Hacer",
            "is_done": is_done,
            "weight": w,
            "progress_pct": pct,
            "due_date": str(t.due_date) if t.due_date else None,
            "contribution_pct": 0,  # se rellena abajo
        })

    overall = round(weighted_sum / total_weight, 1) if total_weight else 0
    for r in rows:
        r["contribution_pct"] = round(r["weight"] / total_weight * 100, 1) if total_weight else 0

    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "status": str(project.status) if project.status else None,
            "leader": project.leader.full_name if project.leader else None,
        },
        "overall_pct": overall,
        "total_weight": total_weight,
        "tasks_count": len(rows),
        "tasks_done": sum(1 for r in rows if r["is_done"]),
        "tasks": rows,
    }


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
            selectinload(Project.leader).selectinload(User.main_business),
            selectinload(Project.members).selectinload(User.main_business),
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
            selectinload(Project.leader).selectinload(User.main_business),
            selectinload(Project.members).selectinload(User.main_business),
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
            selectinload(Project.leader).selectinload(User.main_business),
            selectinload(Project.members).selectinload(User.main_business),
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
