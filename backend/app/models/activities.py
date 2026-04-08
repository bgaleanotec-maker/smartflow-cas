import enum
from datetime import date, datetime, time
from typing import Optional, List
from sqlalchemy import (
    String, Boolean, Integer, Date, DateTime, Time, Enum, ForeignKey, Text,
    func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class ActivityFrequency(str, enum.Enum):
    UNICA = "unica"
    DIARIA = "diaria"
    SEMANAL = "semanal"
    QUINCENAL = "quincenal"
    MENSUAL = "mensual"
    TRIMESTRAL = "trimestral"
    SEMESTRAL = "semestral"
    ANUAL = "anual"


class ActivityStatus(str, enum.Enum):
    SIN_INICIAR = "sin_iniciar"
    EN_PROCESO = "en_proceso"
    COMPLETADA = "completada"
    VENCIDA = "vencida"
    PROXIMA_A_VENCER = "proxima_a_vencer"
    CANCELADA = "cancelada"


class ActivityScope(str, enum.Enum):
    CAS = "CAS"
    BO = "BO"
    TODOS = "TODOS"


class RecurringActivity(Base):
    """Actividad recurrente - la plantilla que genera instancias."""
    __tablename__ = "recurring_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(50), default="gestion")  # gestion, reporte, reunion, seguimiento, operativo
    frequency: Mapped[ActivityFrequency] = mapped_column(Enum(ActivityFrequency), nullable=False)
    scope: Mapped[ActivityScope] = mapped_column(Enum(ActivityScope), default=ActivityScope.TODOS)
    priority: Mapped[str] = mapped_column(String(20), default="media")  # critica, alta, media, baja

    # Scheduling
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)  # null = sin fin
    due_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)  # HH:MM
    day_of_week: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0=lun, 6=dom (para semanal)
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 1-31 (para mensual)
    reminder_days_before: Mapped[int] = mapped_column(Integer, default=1)  # dias antes para recordatorio

    # Assignment
    assigned_to_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    business_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("businesses.id"), nullable=True)

    # Meta
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    color: Mapped[str] = mapped_column(String(7), default="#6366f1")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    assigned_to: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_to_id], lazy="select")
    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id], lazy="select")
    business: Mapped[Optional["Business"]] = relationship("Business", lazy="select")
    instances: Mapped[List["ActivityInstance"]] = relationship(back_populates="activity", order_by="ActivityInstance.due_date.desc()", lazy="select")

    def __repr__(self):
        return f"<RecurringActivity {self.title[:50]} ({self.frequency.value})>"


class ActivityInstance(Base):
    """Instancia concreta de una actividad para una fecha especifica."""
    __tablename__ = "activity_instances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    activity_id: Mapped[int] = mapped_column(Integer, ForeignKey("recurring_activities.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[ActivityStatus] = mapped_column(Enum(ActivityStatus), default=ActivityStatus.SIN_INICIAR)

    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    completed_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    evidence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON attachments
    assigned_to_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    activity: Mapped["RecurringActivity"] = relationship(back_populates="instances")
    assigned_to: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_to_id], lazy="select")
    completed_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[completed_by_id], lazy="select")

    def __repr__(self):
        return f"<ActivityInstance {self.title[:30]} due:{self.due_date} ({self.status.value})>"


# ─── Dashboard Builder ───────────────────────────────────────────────────────

class DashboardWidget(Base):
    """Widget configurable para el dashboard interactivo."""
    __tablename__ = "dashboard_widgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    widget_type: Mapped[str] = mapped_column(String(30), nullable=False)  # kpi, chart_bar, chart_line, chart_pie, table, text, list, progress
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Data source
    data_source: Mapped[str] = mapped_column(String(50), nullable=False)  # activities, demands, incidents, projects, hechos, premisas, custom
    data_query: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON filter config
    data_field: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # field to aggregate

    # Layout
    grid_col: Mapped[int] = mapped_column(Integer, default=0)  # column position
    grid_row: Mapped[int] = mapped_column(Integer, default=0)  # row position
    grid_width: Mapped[int] = mapped_column(Integer, default=1)  # 1-4 columns
    grid_height: Mapped[int] = mapped_column(Integer, default=1)  # 1-3 rows

    # Visual
    color: Mapped[str] = mapped_column(String(7), default="#6366f1")
    icon: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    scope: Mapped[ActivityScope] = mapped_column(Enum(ActivityScope), default=ActivityScope.TODOS)

    # Custom content (for text/html widgets)
    custom_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # markdown or JSON

    # Access
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    created_by: Mapped["User"] = relationship("User", lazy="select")

    def __repr__(self):
        return f"<DashboardWidget {self.widget_type}: {self.title[:30]}>"


# Forward imports
from app.models.user import User  # noqa: E402
from app.models.business import Business  # noqa: E402
