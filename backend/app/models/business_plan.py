"""
Business Plan (BP) module — CAS team
One BP per business per year. Tracks financials, KPIs, and activities.
"""
import enum
from datetime import date, datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, Boolean, Date, DateTime, Enum, ForeignKey, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class BPStatus(str, enum.Enum):
    BORRADOR = "borrador"
    EN_REVISION = "en_revision"
    APROBADO = "aprobado"
    VIGENTE = "vigente"
    CERRADO = "cerrado"


class BPLineCategory(str, enum.Enum):
    INGRESO = "ingreso"
    COSTO_FIJO = "costo_fijo"
    COSTO_VARIABLE = "costo_variable"
    MAGNITUD = "magnitud"   # clients, users, volumes — non-monetary KPIs
    MARGEN = "margen"       # manual margin lines if needed


class BPActivityStatus(str, enum.Enum):
    PENDIENTE = "pendiente"
    EN_PROGRESO = "en_progreso"
    COMPLETADA = "completada"
    CANCELADA = "cancelada"
    VENCIDA = "vencida"


class BPActivityPriority(str, enum.Enum):
    CRITICA = "critica"
    ALTA = "alta"
    MEDIA = "media"
    BAJA = "baja"


class BPActivityCategory(str, enum.Enum):
    COMERCIAL = "comercial"
    OPERATIVO = "operativo"
    FINANCIERO = "financiero"
    ESTRATEGICO = "estrategico"
    REGULATORIO = "regulatorio"
    TECNOLOGIA = "tecnologia"


class BusinessPlan(Base):
    __tablename__ = "business_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_id: Mapped[int] = mapped_column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)          # 2026, 2027 …
    status: Mapped[BPStatus] = mapped_column(Enum(BPStatus), default=BPStatus.BORRADOR, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)     # optional label
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scope: Mapped[str] = mapped_column(String(10), default="CAS", nullable=False)  # CAS / BO / TODOS

    # Summary KPIs (auto-updated by trigger or on-demand)
    total_ingresos_plan: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_costos_plan: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    margen_bruto_plan: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # %

    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    business: Mapped[Optional["Business"]] = relationship("Business", foreign_keys=[business_id], lazy="select")
    created_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by_id], lazy="select")
    lines: Mapped[list["BPLine"]] = relationship("BPLine", back_populates="bp", cascade="all, delete-orphan", lazy="select")
    activities: Mapped[list["BPActivity"]] = relationship("BPActivity", back_populates="bp", cascade="all, delete-orphan", lazy="select")
    excel_analyses: Mapped[list["BPExcelAnalysis"]] = relationship("BPExcelAnalysis", back_populates="bp", cascade="all, delete-orphan", lazy="select")


class BPLine(Base):
    """One financial or KPI line in a BP (ingreso, costo, magnitud)."""
    __tablename__ = "bp_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bp_id: Mapped[int] = mapped_column(Integer, ForeignKey("business_plans.id"), nullable=False, index=True)
    category: Mapped[BPLineCategory] = mapped_column(Enum(BPLineCategory), nullable=False)
    subcategory: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # e.g. "Nómina", "Licencias"
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(String(30), default="COP", nullable=False)   # COP, USD, %, unidades, clientes

    # Monthly planned values as JSON: {"1": 1000000, "2": 1200000, ... "12": 900000}
    monthly_plan: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Monthly actual values (filled as year progresses)
    monthly_actual: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Rolled-up totals (can be computed or manually set)
    annual_plan: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    annual_actual: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    bp: Mapped["BusinessPlan"] = relationship("BusinessPlan", back_populates="lines", lazy="select")


class BPActivity(Base):
    """Planned initiative/activity linked to a BP. Core 'don't lose activities' feature."""
    __tablename__ = "bp_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bp_id: Mapped[int] = mapped_column(Integer, ForeignKey("business_plans.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[BPActivityCategory] = mapped_column(Enum(BPActivityCategory), default=BPActivityCategory.OPERATIVO, nullable=False)
    priority: Mapped[BPActivityPriority] = mapped_column(Enum(BPActivityPriority), default=BPActivityPriority.MEDIA, nullable=False)
    status: Mapped[BPActivityStatus] = mapped_column(Enum(BPActivityStatus), default=BPActivityStatus.PENDIENTE, nullable=False)

    owner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completion_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0-100

    # Optional link to a premisa
    premisa_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("premisas_negocio.id"), nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    evidence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # link or note
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    bp: Mapped["BusinessPlan"] = relationship("BusinessPlan", back_populates="activities", lazy="select")
    owner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[owner_id], lazy="select")


class BPExcelAnalysis(Base):
    """Stored Excel file upload with AI-generated analysis."""
    __tablename__ = "bp_excel_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bp_id: Mapped[int] = mapped_column(Integer, ForeignKey("business_plans.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Parsed data (top rows/columns as JSON for display)
    parsed_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # AI-generated summary
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_insights: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # structured findings

    uploaded_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    bp: Mapped["BusinessPlan"] = relationship("BusinessPlan", back_populates="excel_analyses", lazy="select")
    uploaded_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[uploaded_by_id], lazy="select")
