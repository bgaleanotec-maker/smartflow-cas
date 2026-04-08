import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import (
    String, Boolean, Integer, Date, DateTime, Enum, ForeignKey, Text,
    Numeric, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


# ─── Enums ───────────────────────────────────────────────────────────────────

class DemandStatus(str, enum.Enum):
    BORRADOR = "borrador"
    ENVIADA = "enviada"
    EN_EVALUACION = "en_evaluacion"
    APROBADA = "aprobada"
    EN_EJECUCION = "en_ejecucion"
    PAUSADA = "pausada"
    RECHAZADA = "rechazada"
    CERRADA = "cerrada"


class BeneficioTipo(str, enum.Enum):
    AHORRO_COSTO = "ahorro_costo"
    AUMENTO_INGRESO = "aumento_ingreso"
    AMBOS = "ambos"
    NINGUNO = "ninguno"


class RequirementStatus(str, enum.Enum):
    PENDIENTE = "pendiente"
    EN_PROGRESO = "en_progreso"
    COMPLETADO = "completado"
    CANCELADO = "cancelado"


# ─── Demand Request ──────────────────────────────────────────────────────────

class DemandRequest(Base):
    __tablename__ = "demand_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    demand_number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    radicado: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[DemandStatus] = mapped_column(
        Enum(DemandStatus), default=DemandStatus.BORRADOR, nullable=False
    )

    # Formulario Jira campos
    vicepresidencia_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("demand_catalogs.id"), nullable=True
    )
    telefono_contacto: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    enfoque: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array
    aplicaciones: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array
    situacion_actual: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pilares_estrategicos_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("demand_catalogs.id"), nullable=True
    )
    justificacion_pilares: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mejoras_procesos_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("demand_catalogs.id"), nullable=True
    )
    descripcion_procesos: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    usuarios_impactados_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("demand_catalogs.id"), nullable=True
    )
    detalle_clientes_impactados: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reduce_riesgo_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("demand_catalogs.id"), nullable=True
    )
    explicacion_riesgo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    oportunidad_negocio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Beneficio economico
    beneficio_tipo: Mapped[Optional[BeneficioTipo]] = mapped_column(
        Enum(BeneficioTipo), nullable=True
    )
    beneficio_monto_estimado: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    beneficio_monto_real: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2), nullable=True
    )

    # Responsables
    sponsor_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    lider_proceso_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    responsable_negocio_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    responsable_negocio_email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # SOX y regulatorio
    impacta_sox: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    sox_detalle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    es_regulatorio: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    regulatorio_detalle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Deadline
    tiene_deadline: Mapped[bool] = mapped_column(Boolean, default=False)
    fecha_deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    impacto_no_ejecutar: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Requerimientos texto
    detalle_requerimientos: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    migracion_datos: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relaciones FK
    created_by_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    assigned_to_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    business_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("businesses.id"), nullable=True
    )
    parent_demand_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("demand_requests.id"), nullable=True
    )
    related_project_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("projects.id"), nullable=True
    )
    # Escalacion desde incidente
    source_incident_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("incidents.id"), nullable=True
    )

    # Campos dinamicos y metadata
    custom_fields: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    attachments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON

    # Audit
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id], lazy="select")
    assigned_to: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_to_id], lazy="select")
    business: Mapped[Optional["Business"]] = relationship("Business", lazy="select")
    parent_demand: Mapped[Optional["DemandRequest"]] = relationship(
        "DemandRequest", remote_side="DemandRequest.id", foreign_keys=[parent_demand_id], lazy="select"
    )
    children: Mapped[List["DemandRequest"]] = relationship(
        "DemandRequest", foreign_keys=[parent_demand_id], lazy="select"
    )
    related_project: Mapped[Optional["Project"]] = relationship("Project", lazy="select")
    source_incident: Mapped[Optional["Incident"]] = relationship("Incident", lazy="select")

    vicepresidencia: Mapped[Optional["DemandCatalog"]] = relationship(
        "DemandCatalog", foreign_keys=[vicepresidencia_id], lazy="select"
    )
    pilares_estrategicos: Mapped[Optional["DemandCatalog"]] = relationship(
        "DemandCatalog", foreign_keys=[pilares_estrategicos_id], lazy="select"
    )
    mejoras_procesos: Mapped[Optional["DemandCatalog"]] = relationship(
        "DemandCatalog", foreign_keys=[mejoras_procesos_id], lazy="select"
    )
    usuarios_impactados: Mapped[Optional["DemandCatalog"]] = relationship(
        "DemandCatalog", foreign_keys=[usuarios_impactados_id], lazy="select"
    )
    reduce_riesgo: Mapped[Optional["DemandCatalog"]] = relationship(
        "DemandCatalog", foreign_keys=[reduce_riesgo_id], lazy="select"
    )

    timeline: Mapped[List["DemandTimeline"]] = relationship(
        back_populates="demand", order_by="DemandTimeline.created_at.desc()", lazy="select"
    )
    meeting_notes: Mapped[List["DemandMeetingNote"]] = relationship(
        back_populates="demand", order_by="DemandMeetingNote.meeting_date.desc()", lazy="select"
    )
    requirements: Mapped[List["DemandRequirement"]] = relationship(
        back_populates="demand", order_by="DemandRequirement.order_index", lazy="select"
    )

    def __repr__(self):
        return f"<DemandRequest {self.demand_number}: {self.title[:50]}>"


# ─── Demand Timeline ─────────────────────────────────────────────────────────

class DemandTimeline(Base):
    __tablename__ = "demand_timeline"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    demand_id: Mapped[int] = mapped_column(Integer, ForeignKey("demand_requests.id"), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    old_value: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    demand: Mapped["DemandRequest"] = relationship(back_populates="timeline")
    user: Mapped[Optional["User"]] = relationship("User", lazy="select")

    def __repr__(self):
        return f"<DemandTimeline {self.action} on {self.demand_id}>"


# ─── Demand Meeting Notes ────────────────────────────────────────────────────

class DemandMeetingNote(Base):
    __tablename__ = "demand_meeting_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    demand_id: Mapped[int] = mapped_column(Integer, ForeignKey("demand_requests.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    meeting_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attendees: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    action_items: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    next_meeting_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    demand: Mapped["DemandRequest"] = relationship(back_populates="meeting_notes")
    created_by: Mapped["User"] = relationship("User", lazy="select")

    def __repr__(self):
        return f"<DemandMeetingNote {self.title}>"


# ─── Demand Requirements ─────────────────────────────────────────────────────

class DemandRequirement(Base):
    __tablename__ = "demand_requirements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    demand_id: Mapped[int] = mapped_column(Integer, ForeignKey("demand_requests.id"), nullable=False)
    item_number: Mapped[int] = mapped_column(Integer, nullable=False)
    modulo_impactado: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    descripcion_requerimiento: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    quien: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    que: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    criterios_aceptacion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    observaciones: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[RequirementStatus] = mapped_column(
        Enum(RequirementStatus), default=RequirementStatus.PENDIENTE
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    demand: Mapped["DemandRequest"] = relationship(back_populates="requirements")

    def __repr__(self):
        return f"<DemandRequirement #{self.item_number}>"


# Forward reference imports
from app.models.user import User  # noqa: E402
from app.models.business import Business  # noqa: E402
from app.models.project import Project  # noqa: E402
from app.models.incident import Incident  # noqa: E402
from app.models.demand_catalog import DemandCatalog  # noqa: E402
