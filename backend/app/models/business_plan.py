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
    recommendations: Mapped[list["BPRecommendation"]] = relationship("BPRecommendation", back_populates="bp", cascade="all, delete-orphan", lazy="select")
    scenarios: Mapped[list["BPScenario"]] = relationship("BPScenario", back_populates="bp", cascade="all, delete-orphan", lazy="select")
    audit_logs: Mapped[list["BPAuditLog"]] = relationship("BPAuditLog", back_populates="bp", cascade="all, delete-orphan", lazy="select")
    milestones: Mapped[list["BPMilestone"]] = relationship("BPMilestone", back_populates="bp", cascade="all, delete-orphan", lazy="select")


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

    # AI-generated fields
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_confidence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0-100
    ai_rationale: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    line_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

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

    # Schedule & Tasks enhancements
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    estimated_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    depends_on_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("bp_activities.id"), nullable=True)
    is_milestone: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminder_days_before: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    reminder_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    tags: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # list of tag strings
    grupo: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # CAS sub-group: Margen, Opex, Magnitud, Juntas, Brookfield, Vicepresidencia...

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    bp: Mapped["BusinessPlan"] = relationship("BusinessPlan", back_populates="activities", lazy="select")
    owner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[owner_id], lazy="select")
    depends_on: Mapped[Optional["BPActivity"]] = relationship(
        "BPActivity",
        foreign_keys="[BPActivity.depends_on_id]",
        primaryjoin="BPActivity.depends_on_id == BPActivity.id",
        uselist=False,
        lazy="select",
    )
    checklist: Mapped[list["BPChecklist"]] = relationship("BPChecklist", back_populates="activity", cascade="all, delete-orphan", lazy="select", order_by="BPChecklist.order_index")
    comments: Mapped[list["BPComment"]] = relationship("BPComment", back_populates="activity", cascade="all, delete-orphan", lazy="select", order_by="BPComment.created_at")


class BPChecklist(Base):
    """Checklist item inside a BPActivity."""
    __tablename__ = "bp_checklist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    activity_id: Mapped[int] = mapped_column(Integer, ForeignKey("bp_activities.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    activity: Mapped["BPActivity"] = relationship("BPActivity", back_populates="checklist", lazy="select")
    completed_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[completed_by_id], lazy="select")


class BPComment(Base):
    """Comment thread on a BPActivity."""
    __tablename__ = "bp_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    activity_id: Mapped[int] = mapped_column(Integer, ForeignKey("bp_activities.id"), nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    activity: Mapped["BPActivity"] = relationship("BPActivity", back_populates="comments", lazy="select")
    author: Mapped["User"] = relationship("User", foreign_keys=[author_id], lazy="select")


class BPMilestone(Base):
    """Key milestone date in a BusinessPlan timeline."""
    __tablename__ = "bp_milestones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bp_id: Mapped[int] = mapped_column(Integer, ForeignKey("business_plans.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="pendiente", nullable=False)  # pendiente/alcanzado/perdido
    color: Mapped[str] = mapped_column(String(20), default="#6366f1", nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    bp: Mapped["BusinessPlan"] = relationship("BusinessPlan", back_populates="milestones", lazy="select")


class BPExcelAnalysis(Base):
    """Stored Excel/image file upload with AI-generated analysis."""
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

    # New fields for enhanced AI analysis
    file_type: Mapped[str] = mapped_column(String(20), default="excel", nullable=False)  # excel/image
    structured_extraction: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    applied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    bp: Mapped["BusinessPlan"] = relationship("BusinessPlan", back_populates="excel_analyses", lazy="select")
    uploaded_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[uploaded_by_id], lazy="select")


class BPRecommendation(Base):
    """AI-generated or manual strategic recommendations for a BP."""
    __tablename__ = "bp_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bp_id: Mapped[int] = mapped_column(Integer, ForeignKey("business_plans.id"), nullable=False, index=True)

    source: Mapped[str] = mapped_column(String(20), default="ai", nullable=False)  # ai / manual
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # comercial/financiero/operativo/estrategico/riesgo/oportunidad
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="media", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="pendiente", nullable=False)  # pendiente/aceptada/en_revision/descartada
    impact_level: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # alto/medio/bajo
    rec_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    bp: Mapped["BusinessPlan"] = relationship("BusinessPlan", back_populates="recommendations", lazy="select")
