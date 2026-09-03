"""WorkComment — comentarios en tareas y proyectos, con opción de push
(notificación in-app + WhatsApp al responsable)."""
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, ForeignKey, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class WorkComment(Base):
    __tablename__ = "work_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)
    project_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("projects.id"), nullable=True, index=True)

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_push: Mapped[bool] = mapped_column(Boolean, default=False)   # fue enviado con notificación

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", lazy="select")


from app.models.user import User  # noqa: E402
