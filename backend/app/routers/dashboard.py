from fastapi import APIRouter
from sqlalchemy import select
from app.core.deps import DB, CurrentUser

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/attention")
async def get_attention_items(db: DB, current_user: CurrentUser):
    from datetime import date, timedelta
    from app.models.epic import Story, StoryStatus, StoryUpdate
    from sqlalchemy.orm import selectinload

    today = date.today()
    threshold = today + timedelta(days=3)

    opts = [
        selectinload(Story.assigned_to),
        selectinload(Story.epic),
        selectinload(Story.updates).selectinload(StoryUpdate.user),
    ]

    q = select(Story).options(*opts).where(
        (Story.is_blocking == True) |
        (Story.status == StoryStatus.bloqueada) |
        (
            (Story.status == StoryStatus.en_progreso) &
            (Story.due_date != None) &
            (Story.due_date <= threshold)
        )
    ).order_by(Story.is_blocking.desc(), Story.due_date)

    stories = (await db.execute(q)).scalars().all()

    # Group by project
    from collections import defaultdict
    by_project = defaultdict(list)
    for s in stories:
        pid = s.project_id or 0
        by_project[pid].append({
            "id": s.id,
            "title": s.title,
            "status": s.status,
            "is_blocking": s.is_blocking,
            "due_date": str(s.due_date) if s.due_date else None,
            "assigned_to": s.assigned_to.full_name if s.assigned_to else None,
            "epic_title": s.epic.title if s.epic else None,
            "last_update": s.updates[0].content[:100] if s.updates else None,
        })

    return [{"project_id": k, "stories": v} for k, v in by_project.items()]
