"""Note / NoteSpace — mini Obsidian personal: espacios y notas markdown.
Solo texto (sin adjuntos Word/PDF). Cada usuario ve únicamente sus notas."""
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, ForeignKey, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class NoteSpace(Base):
    """Espacio/cuaderno de notas (puede vincularse a un proyecto)."""
    __tablename__ = "note_spaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), default="📓")
    project_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("projects.id"), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Optional["Project"]] = relationship("Project", lazy="select")


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    space_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("note_spaces.id"), nullable=True, index=True)

    title: Mapped[str] = mapped_column(String(300), default="Nota sin título")
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # Markdown puro
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    from_voice: Mapped[bool] = mapped_column(Boolean, default=False)      # nació de nota de voz

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    space: Mapped[Optional["NoteSpace"]] = relationship("NoteSpace", lazy="select")


from app.models.project import Project  # noqa: E402
