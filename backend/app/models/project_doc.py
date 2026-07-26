"""ProjectDoc — documentación viva por proyecto (markdown con código y flujos)."""
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class ProjectDoc(Base):
    __tablename__ = "project_docs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # Markdown (código, tablas, links a flujos)
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    updated_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    updated_by: Mapped[Optional["User"]] = relationship("User", lazy="select")
    project: Mapped["Project"] = relationship("Project", lazy="select")


from app.models.user import User  # noqa: E402
from app.models.project import Project  # noqa: E402
