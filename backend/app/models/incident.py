import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Boolean, Integer, DateTime, Enum, ForeignKey,
    Text, func, Numeric
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from decimal import Decimal


class IncidentSeverity(str, enum.Enum):
    CRITICAL = "critico"
    HIGH = "alto"
    MEDIUM = "medio"
    LOW = "bajo"


class IncidentStatus(str, enum.Enum):
    OPEN = "abierto"
    INVESTIGATING = "en_investigacion"
    RESOLVED = "resuelto"
    CLOSED = "cerrado"


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    incident_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # INC-0001

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Categorización
    category_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("incident_categories.id"), nullable=True
    )
    business_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("businesses.id"), nullable=True
    )
    severity: Mapped[IncidentSeverity] = mapped_column(
        Enum(IncidentSeverity), default=IncidentSeverity.MEDIUM
    )
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus), default=IncidentStatus.OPEN
    )

    # Impacto económico
    has_economic_impact: Mapped[bool] = mapped_column(Boolean, default=False)
    economic_impact_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    economic_impact_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    affected_users_count: Mapped[int] = mapped_column(Integer, default=0)

    # Responsable
    responsible_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    reporter_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )

    # Análisis
    root_cause: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Proyecto relacionado
    related_project_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("projects.id"), nullable=True
    )

    # Fechas
    detection_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolution_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Metadata
    tags: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    attachments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    category: Mapped[Optional["IncidentCategory"]] = relationship("IncidentCategory")
    business: Mapped[Optional["Business"]] = relationship("Business")
    responsible: Mapped[Optional["User"]] = relationship("User", foreign_keys=[responsible_id])
    reporter: Mapped[Optional["User"]] = relationship("User", foreign_keys=[reporter_id])
    related_project: Mapped[Optional["Project"]] = relationship("Project")
    timeline: Mapped[list["IncidentTimeline"]] = relationship(
        "IncidentTimeline", back_populates="incident", order_by="IncidentTimeline.created_at"
    )


class IncidentTimeline(Base):
    __tablename__ = "incident_timeline"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    incident_id: Mapped[int] = mapped_column(Integer, ForeignKey("incidents.id"), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)  # "status_change", "comment", etc.
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    old_value: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    incident: Mapped["Incident"] = relationship("Incident", back_populates="timeline")
    user: Mapped[Optional["User"]] = relationship("User")
