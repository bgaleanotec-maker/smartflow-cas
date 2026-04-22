"""Schemas for ARIA Financial Intelligence module."""
from typing import Optional, Any
from datetime import datetime
from pydantic import BaseModel


class BPAssumptionsCreate(BaseModel):
    business_id: int
    year: int
    ipc_pct: Optional[float] = None
    gdp_growth_pct: Optional[float] = None
    trm_avg: Optional[float] = None
    banrep_rate_pct: Optional[float] = None
    market_growth_pct: Optional[float] = None
    client_growth_pct: Optional[float] = None
    churn_rate_pct: Optional[float] = None
    arpu_monthly: Optional[float] = None
    tariff_adjustment_pct: Optional[float] = None
    salary_increase_pct: Optional[float] = None
    energy_cost_change_pct: Optional[float] = None
    custom_assumptions: Optional[dict] = None
    # Volumen absoluto de clientes
    client_volume_current: Optional[int] = None
    client_volume_projected: Optional[int] = None
    client_volume_actual: Optional[int] = None
    notes: Optional[str] = None


class BPAssumptionsUpdate(BaseModel):
    ipc_pct: Optional[float] = None
    gdp_growth_pct: Optional[float] = None
    trm_avg: Optional[float] = None
    banrep_rate_pct: Optional[float] = None
    market_growth_pct: Optional[float] = None
    client_growth_pct: Optional[float] = None
    churn_rate_pct: Optional[float] = None
    arpu_monthly: Optional[float] = None
    tariff_adjustment_pct: Optional[float] = None
    salary_increase_pct: Optional[float] = None
    energy_cost_change_pct: Optional[float] = None
    custom_assumptions: Optional[dict] = None
    # Volumen absoluto de clientes
    client_volume_current: Optional[int] = None
    client_volume_projected: Optional[int] = None
    client_volume_actual: Optional[int] = None
    notes: Optional[str] = None


class BPAssumptionsResponse(BaseModel):
    id: int
    business_id: int
    business_name: Optional[str] = None
    year: int
    ipc_pct: Optional[float] = None
    gdp_growth_pct: Optional[float] = None
    trm_avg: Optional[float] = None
    banrep_rate_pct: Optional[float] = None
    market_growth_pct: Optional[float] = None
    client_growth_pct: Optional[float] = None
    churn_rate_pct: Optional[float] = None
    arpu_monthly: Optional[float] = None
    tariff_adjustment_pct: Optional[float] = None
    salary_increase_pct: Optional[float] = None
    energy_cost_change_pct: Optional[float] = None
    custom_assumptions: Optional[dict] = None
    notes: Optional[str] = None
    source: str
    created_at: datetime
    updated_at: datetime


class ARIAChatMessage(BaseModel):
    message: str
    context_type: str = "general"  # general / audit / sensitivity / scenarios


class ARIAChatResponse(BaseModel):
    response: str
    audit_log_id: Optional[int] = None
    structured_data: Optional[dict] = None


class BPSensitivityRequest(BaseModel):
    variables: list[str]  # which variables to stress-test: ["client_growth_pct", "ipc_pct", ...]
    ranges: Optional[list[float]] = None  # percentage changes to test, default [-20, -10, 0, +10, +20]


class BPScenarioGenerateRequest(BaseModel):
    use_assumptions_id: Optional[int] = None  # If provided, use stored assumptions
    custom_context: Optional[str] = None  # Additional context for AI
