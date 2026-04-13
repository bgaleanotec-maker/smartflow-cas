import enum
from datetime import date, datetime
from typing import Optional, List
from sqlalchemy import String, Text, Boolean, Integer, ForeignKey, Enum, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.user import User


class EpicStatus(str, enum.Enum):
    backlog = "backlog"
    en_progreso = "en_progreso"
    completada = "completada"
    cancelada = "cancelada"


class StoryStatus(str, enum.Enum):
    pendiente = "pendiente"
    en_progreso = "en_progreso"
    en_revision = "en_revision"
    completada = "completada"
    bloqueada = "bloqueada"


class StoryUpdateType(str, enum.Enum):
    novedad = "novedad"
    bloqueo = "bloqueo"
    desbloqueo = "desbloqueo"
    entrega = "entrega"
    comentario = "comentario"


class SmartEpic(Base):
    __tablename__ = "smart_epics"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    status: Mapped[EpicStatus] = mapped_column(Enum(EpicStatus), default=EpicStatus.backlog)
    priority: Mapped[str] = mapped_column(String(20), default="media")  # alta/media/baja
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    owner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[owner_id])
    stories: Mapped[List["Story"]] = relationship("Story", back_populates="epic", cascade="all, delete-orphan", order_by="Story.order")


class Story(Base):
    __tablename__ = "stories"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    acceptance_criteria: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    epic_id: Mapped[Optional[int]] = mapped_column(ForeignKey("smart_epics.id", ondelete="CASCADE"), nullable=True, index=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    status: Mapped[StoryStatus] = mapped_column(Enum(StoryStatus), default=StoryStatus.pendiente)
    priority: Mapped[str] = mapped_column(String(20), default="media")
    assigned_to_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    story_points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_blocking: Mapped[bool] = mapped_column(Boolean, default=False)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    epic: Mapped[Optional["SmartEpic"]] = relationship("SmartEpic", back_populates="stories")
    assigned_to: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_to_id])
    updates: Mapped[List["StoryUpdate"]] = relationship("StoryUpdate", back_populates="story", cascade="all, delete-orphan", order_by="StoryUpdate.created_at.desc()")


class StoryUpdate(Base):
    __tablename__ = "story_updates"
    id: Mapped[int] = mapped_column(primary_key=True)
    story_id: Mapped[int] = mapped_column(ForeignKey("stories.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    update_type: Mapped[StoryUpdateType] = mapped_column(Enum(StoryUpdateType), default=StoryUpdateType.novedad)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    story: Mapped["Story"] = relationship("Story", back_populates="updates")
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id])
