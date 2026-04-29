"""QuickTask — tareas puntuales no asociadas a proyectos."""
from datetime import date, datetime
from typing import Optional, List
from sqlalchemy import Integer, String, Text, ForeignKey, DateTime, Boolean, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


# ─── Categories ───────────────────────────────────────────────────────────────
QUICK_TASK_CATEGORIES = [
    "general",
    "reunion",
    "gestion",
    "seguimiento",
    "revision",
    "soporte",
    "capacitacion",
    "otro",
]


class QuickTask(Base):
    __tablename__ = "quick_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    business_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("businesses.id"), nullable=True)
    assigned_to_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pendiente")  # pendiente | en_progreso | completada
    priority: Mapped[str] = mapped_column(String(10), default="media")   # baja | media | alta | urgente
    # ── NEW: category & meeting ────────────────────────────────────────────────
    category: Mapped[str] = mapped_column(String(30), default="general", nullable=False)
    # Meeting-specific fields (only used when category == 'reunion')
    meeting_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    meeting_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Sub-tasks: self-referential FK (meeting sub-tasks)
    parent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("quick_tasks.id"), nullable=True)
    # ──────────────────────────────────────────────────────────────────────────
    estimated_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    logged_minutes: Mapped[int] = mapped_column(Integer, default=0)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    assigned_to: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_to_id])
    business: Mapped[Optional["Business"]] = relationship("Business")
    # Self-referential: parent task ↔ sub-tasks
    children = relationship("QuickTask", foreign_keys="[QuickTask.parent_id]", back_populates="parent")
    parent = relationship("QuickTask", foreign_keys="[QuickTask.parent_id]", back_populates="children", remote_side="[QuickTask.id]")
