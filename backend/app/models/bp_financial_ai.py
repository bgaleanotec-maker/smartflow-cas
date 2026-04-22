"""
ARIA Financial Intelligence — Assumptions, Scenarios, Audit history for BP module.
"""
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, Boolean, Date, DateTime, Enum, ForeignKey, Text, JSON, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class BPAssumptions(Base):
    """Annual macro + business assumptions per (business, year). Foundation for all projections."""
    __tablename__ = "bp_assumptions"
    __table_args__ = (UniqueConstraint("business_id", "year", name="uq_bp_assumptions_biz_year"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    business_id: Mapped[int] = mapped_column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    # ── Macro Colombia ──
    ipc_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)          # Inflación IPC % (ej: 5.5)
    gdp_growth_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)   # Crecimiento PIB %
    trm_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)          # TRM promedio COP/USD
    banrep_rate_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Tasa Banrep %

    # ── Mercado / Clientes ──
    market_growth_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)    # Crecimiento mercado %
    client_growth_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)    # Crecimiento clientes %
    churn_rate_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)       # Deserción %
    arpu_monthly: Mapped[Optional[float]] = mapped_column(Float, nullable=True)         # ARPU COP/mes
    # ── Volumen de Clientes (absolutos) ──
    client_volume_current: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)     # Clientes actuales inicio de año
    client_volume_projected: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)   # Clientes proyectados fin de año
    client_volume_actual: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)      # Clientes reales (actual YTD)

    # ── Precios / Costos ──
    tariff_adjustment_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Ajuste tarifario %
    salary_increase_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)    # Incremento salarial %
    energy_cost_change_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True) # Variación costo energía/gas %

    # ── Custom ──
    custom_assumptions: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # {"nombre": {"value": X, "unit": "%", "description": "...", "source": "..."}}

    source: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)  # manual / ai
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    business: Mapped[Optional["Business"]] = relationship("Business", foreign_keys=[business_id], lazy="select")
    created_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by_id], lazy="select")


class BPScenario(Base):
    """A named financial scenario (optimista/base/pesimista/custom) for a BusinessPlan."""
    __tablename__ = "bp_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bp_id: Mapped[int] = mapped_column(Integer, ForeignKey("business_plans.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False)       # "Optimista", "Base", "Pesimista"
    scenario_type: Mapped[str] = mapped_column(String(20), default="base", nullable=False)  # optimista/base/pesimista/custom
    probability_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)          # 0-100
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Per-line adjustments: {str(line_id): {"type": "multiplier"|"absolute", "value": float}}
    line_adjustments: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # AI-computed totals for this scenario
    computed_ingresos: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    computed_costos: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    computed_margen_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    computed_ebitda: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # The assumptions and drivers used
    key_assumptions: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # AI narrative explaining this scenario
    ai_narrative: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Sensitivity table: {variable: {"-20%": val, "-10%": val, "0%": val, "+10%": val, "+20%": val}}
    sensitivity_table: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    source: Mapped[str] = mapped_column(String(20), default="ai", nullable=False)  # ai / manual
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    bp: Mapped["BusinessPlan"] = relationship("BusinessPlan", back_populates="scenarios", lazy="select")


class BPAuditLog(Base):
    """History of every ARIA audit performed on a BP."""
    __tablename__ = "bp_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bp_id: Mapped[int] = mapped_column(Integer, ForeignKey("business_plans.id"), nullable=False, index=True)

    audit_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "full_audit" / "sensitivity" / "scenarios" / "chat" / "variance"
    request_context: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # What was sent to AI

    # Full AI response
    ai_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    structured_output: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # Parsed sections

    # Key metrics at time of audit
    snapshot_metrics: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    requested_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    bp: Mapped["BusinessPlan"] = relationship("BusinessPlan", back_populates="audit_logs", lazy="select")
    requested_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[requested_by_id], lazy="select")
