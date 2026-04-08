import enum
from datetime import date, datetime
from typing import Optional, List
from sqlalchemy import (
    String, Boolean, Integer, Date, DateTime, Enum, ForeignKey, Text,
    Numeric, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


# ─── Daily Standup ───────────────────────────────────────────────────────────

class DailyStandup(Base):
    """Gerenciamiento diario - entrada de standup por usuario."""
    __tablename__ = "daily_standups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    standup_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    what_did: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Que hice ayer
    what_will: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Que hare hoy
    blockers: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Impedimentos
    mood: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # feliz, neutral, preocupado, bloqueado
    energy_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 1-5

    # Optional links
    project_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("projects.id"), nullable=True)
    scope: Mapped[str] = mapped_column(String(10), default="TODOS")  # CAS, BO, TODOS

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", lazy="select")
    project: Mapped[Optional["Project"]] = relationship("Project", lazy="select")

    def __repr__(self):
        return f"<DailyStandup {self.user_id} {self.standup_date}>"


# ─── Retrospective ──────────────────────────────────────────────────────────

class Retrospective(Base):
    """Retrospectiva de sprint o periodo."""
    __tablename__ = "retrospectives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    sprint_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("sprints.id"), nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("projects.id"), nullable=True)
    retro_date: Mapped[date] = mapped_column(Date, nullable=False)
    scope: Mapped[str] = mapped_column(String(10), default="TODOS")

    # Feedback categories (JSON arrays)
    went_well: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Que salio bien
    to_improve: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Que mejorar
    action_items: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Acciones concretas
    kudos: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Reconocimientos

    facilitator_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    attendees: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON user ids
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    facilitator: Mapped["User"] = relationship("User", lazy="select")
    project: Mapped[Optional["Project"]] = relationship("Project", lazy="select")

    def __repr__(self):
        return f"<Retrospective {self.title}>"


# ─── Sprint Goals & Velocity ─────────────────────────────────────────────────

class SprintMetrics(Base):
    """Metricas de sprint calculadas para velocity tracking."""
    __tablename__ = "sprint_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sprint_id: Mapped[int] = mapped_column(Integer, ForeignKey("sprints.id"), nullable=False, unique=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False)

    # Planning
    planned_points: Mapped[int] = mapped_column(Integer, default=0)
    completed_points: Mapped[int] = mapped_column(Integer, default=0)
    carried_over_points: Mapped[int] = mapped_column(Integer, default=0)

    # Tasks
    total_tasks: Mapped[int] = mapped_column(Integer, default=0)
    completed_tasks: Mapped[int] = mapped_column(Integer, default=0)

    # Time
    estimated_hours: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    actual_hours: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)

    # Quality
    bugs_found: Mapped[int] = mapped_column(Integer, default=0)
    scope_changes: Mapped[int] = mapped_column(Integer, default=0)

    # Lean metrics
    cycle_time_avg_days: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    lead_time_avg_days: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    wip_avg: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)

    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<SprintMetrics sprint:{self.sprint_id} vel:{self.completed_points}>"


# ─── Kaizen (Continuous Improvement) ─────────────────────────────────────────

class KaizenItem(Base):
    """Item de mejora continua - Kaizen board."""
    __tablename__ = "kaizen_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(30), default="proceso")  # proceso, herramienta, comunicacion, calidad, eficiencia
    impact: Mapped[str] = mapped_column(String(20), default="medio")  # alto, medio, bajo
    effort: Mapped[str] = mapped_column(String(20), default="medio")  # alto, medio, bajo
    status: Mapped[str] = mapped_column(String(20), default="propuesto")  # propuesto, aprobado, en_progreso, implementado, descartado
    scope: Mapped[str] = mapped_column(String(10), default="TODOS")

    proposed_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    source_retro_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("retrospectives.id"), nullable=True)

    result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Resultado despues de implementar
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    proposed_by: Mapped["User"] = relationship("User", foreign_keys=[proposed_by_id], lazy="select")
    assigned_to: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_to_id], lazy="select")

    def __repr__(self):
        return f"<KaizenItem {self.title[:50]}>"


# Forward imports
from app.models.user import User  # noqa: E402
from app.models.project import Project, Sprint  # noqa: E402
