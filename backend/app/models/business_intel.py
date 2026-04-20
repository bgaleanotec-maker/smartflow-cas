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


# ─── Hechos Relevantes ───────────────────────────────────────────────────────

class HechoRelevante(Base):
    __tablename__ = "hechos_relevantes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(50), default="comercial")  # comercial, operativo, estrategico, regulatorio
    impact_level: Mapped[str] = mapped_column(String(20), default="medio")  # alto, medio, bajo
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    week_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    week_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    business_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("businesses.id"), nullable=True)
    action_required: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    responsible_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="reportado")  # reportado, en_seguimiento, resuelto, cerrado
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    attachments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id], lazy="select")
    business: Mapped[Optional["Business"]] = relationship("Business", lazy="select")

    def __repr__(self):
        return f"<HechoRelevante W{self.week_number}: {self.title[:50]}>"


# ─── Premisas de Negocio ─────────────────────────────────────────────────────

class PremisaStatus(str, enum.Enum):
    ACTIVA = "activa"
    EN_REVISION = "en_revision"
    APROBADA = "aprobada"
    DESCARTADA = "descartada"
    VENCIDA = "vencida"


class PremisaNegocio(Base):
    __tablename__ = "premisas_negocio"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(50), default="presupuesto")  # presupuesto, ingresos, costos, mercado, regulatorio
    status: Mapped[PremisaStatus] = mapped_column(Enum(PremisaStatus), default=PremisaStatus.ACTIVA)

    # Presupuesto
    budget_year: Mapped[int] = mapped_column(Integer, nullable=False)
    budget_line: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    estimated_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    actual_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    variance_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)

    # Seguimiento
    assumption_basis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # En que se basa la premisa
    risk_if_wrong: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Que pasa si la premisa es incorrecta
    review_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    recommendations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_recommendation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Recomendacion generada por IA

    business_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("businesses.id"), nullable=True)
    responsible_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id], lazy="select")
    business: Mapped[Optional["Business"]] = relationship("Business", lazy="select")

    # Timeline de seguimiento
    timeline: Mapped[List["PremisaTimeline"]] = relationship(
        back_populates="premisa", order_by="PremisaTimeline.created_at.desc()", lazy="select"
    )

    def __repr__(self):
        return f"<PremisaNegocio {self.budget_year}: {self.title[:50]}>"


class PremisaTimeline(Base):
    __tablename__ = "premisa_timeline"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    premisa_id: Mapped[int] = mapped_column(Integer, ForeignKey("premisas_negocio.id"), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    premisa: Mapped["PremisaNegocio"] = relationship(back_populates="timeline")
    user: Mapped[Optional["User"]] = relationship("User", lazy="select")


# ─── Novedades Operativas ────────────────────────────────────────────────────

class NovedadOperativa(Base):
    __tablename__ = "novedades_operativas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    business_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("businesses.id"), nullable=True)
    has_economic_impact: Mapped[bool] = mapped_column(Boolean, default=False)
    economic_impact_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    impact_type: Mapped[str] = mapped_column(String(20), default="OTRO")       # OPEX | ON | OTRO
    importance_stars: Mapped[int] = mapped_column(Integer, default=3)         # 1-5
    impact_sentiment: Mapped[str] = mapped_column(String(20), default="neutral")  # positivo | neutral | negativo
    has_reproceso: Mapped[bool] = mapped_column(Boolean, default=False)
    reproceso_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 1), nullable=True)
    reproceso_status: Mapped[str] = mapped_column(String(20), default="sin_iniciar")  # subsanado | en_proceso | sin_iniciar
    status: Mapped[str] = mapped_column(String(20), default="activa")         # activa | archivada
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id], lazy="select")
    business: Mapped[Optional["Business"]] = relationship("Business", lazy="select")

    def __repr__(self):
        return f"<NovedadOperativa {self.id}: {self.title[:50]}>"


# Forward imports
from app.models.user import User  # noqa: E402
from app.models.business import Business  # noqa: E402
