"""
Pydantic schemas for Business Plan (BP) module.
"""
from typing import Optional
from datetime import date, datetime
from pydantic import BaseModel, field_validator
from app.models.business_plan import BPStatus, BPLineCategory, BPActivityStatus, BPActivityPriority, BPActivityCategory


# ─── BusinessPlan ─────────────────────────────────────────────────────────────

class BusinessPlanCreate(BaseModel):
    business_id: int
    year: int
    name: Optional[str] = None
    description: Optional[str] = None
    status: BPStatus = BPStatus.BORRADOR
    scope: str = "CAS"


class BusinessPlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[BPStatus] = None
    version: Optional[int] = None
    scope: Optional[str] = None
    total_ingresos_plan: Optional[float] = None
    total_costos_plan: Optional[float] = None
    margen_bruto_plan: Optional[float] = None


class BusinessPlanResponse(BaseModel):
    id: int
    business_id: int
    business_name: Optional[str] = None
    year: int
    status: BPStatus
    version: int
    name: Optional[str] = None
    description: Optional[str] = None
    scope: str
    total_ingresos_plan: Optional[float] = None
    total_costos_plan: Optional[float] = None
    margen_bruto_plan: Optional[float] = None
    created_by_id: int
    created_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Stats computed in router
    activities_total: int = 0
    activities_completed: int = 0
    activities_overdue: int = 0


# ─── BPLine ───────────────────────────────────────────────────────────────────

class BPLineCreate(BaseModel):
    category: BPLineCategory
    subcategory: Optional[str] = None
    name: str
    unit: str = "COP"
    monthly_plan: Optional[dict] = None
    monthly_actual: Optional[dict] = None
    annual_plan: Optional[float] = None
    annual_actual: Optional[float] = None
    notes: Optional[str] = None
    order_index: int = 0


class BPLineUpdate(BaseModel):
    category: Optional[BPLineCategory] = None
    subcategory: Optional[str] = None
    name: Optional[str] = None
    unit: Optional[str] = None
    monthly_plan: Optional[dict] = None
    monthly_actual: Optional[dict] = None
    annual_plan: Optional[float] = None
    annual_actual: Optional[float] = None
    notes: Optional[str] = None
    order_index: Optional[int] = None


class BPLineResponse(BaseModel):
    id: int
    bp_id: int
    category: BPLineCategory
    subcategory: Optional[str] = None
    name: str
    unit: str
    monthly_plan: Optional[dict] = None
    monthly_actual: Optional[dict] = None
    annual_plan: Optional[float] = None
    annual_actual: Optional[float] = None
    notes: Optional[str] = None
    order_index: int
    is_ai_generated: bool = False
    ai_confidence: Optional[int] = None
    ai_rationale: Optional[str] = None


# ─── BPActivity ───────────────────────────────────────────────────────────────

class BPActivityCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: BPActivityCategory = BPActivityCategory.OPERATIVO
    priority: BPActivityPriority = BPActivityPriority.MEDIA
    status: BPActivityStatus = BPActivityStatus.PENDIENTE
    owner_id: Optional[int] = None
    due_date: Optional[date] = None
    completion_date: Optional[date] = None
    progress: int = 0
    premisa_id: Optional[int] = None
    notes: Optional[str] = None
    evidence: Optional[str] = None
    order_index: int = 0
    start_date: Optional[date] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    depends_on_id: Optional[int] = None
    is_milestone: bool = False
    reminder_days_before: int = 3
    tags: Optional[dict] = None
    grupo: Optional[str] = None


class BPActivityUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[BPActivityCategory] = None
    priority: Optional[BPActivityPriority] = None
    status: Optional[BPActivityStatus] = None
    owner_id: Optional[int] = None
    due_date: Optional[date] = None
    completion_date: Optional[date] = None
    progress: Optional[int] = None
    notes: Optional[str] = None
    evidence: Optional[str] = None
    order_index: Optional[int] = None
    start_date: Optional[date] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    depends_on_id: Optional[int] = None
    is_milestone: Optional[bool] = None
    reminder_days_before: Optional[int] = None
    tags: Optional[dict] = None
    grupo: Optional[str] = None


class BPActivityResponse(BaseModel):
    id: int
    bp_id: int
    title: str
    description: Optional[str] = None
    category: BPActivityCategory
    priority: BPActivityPriority
    status: BPActivityStatus
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    due_date: Optional[date] = None
    completion_date: Optional[date] = None
    progress: int
    premisa_id: Optional[int] = None
    notes: Optional[str] = None
    evidence: Optional[str] = None
    order_index: int
    is_overdue: bool = False
    created_at: datetime
    updated_at: datetime


# ─── BPRecommendation ─────────────────────────────────────────────────────────

class BPRecommendationCreate(BaseModel):
    category: str
    title: str
    description: Optional[str] = None
    priority: str = "media"
    impact_level: Optional[str] = None
    source: str = "manual"


class BPRecommendationUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    impact_level: Optional[str] = None


class BPRecommendationResponse(BaseModel):
    id: int
    bp_id: int
    source: str
    category: str
    title: str
    description: Optional[str] = None
    priority: str
    status: str
    impact_level: Optional[str] = None
    is_ai_generated: bool
    rec_metadata: Optional[dict] = None
    created_at: datetime
    updated_at: datetime


# ─── Dashboard ────────────────────────────────────────────────────────────────

class BPBusinessSummary(BaseModel):
    business_id: int
    business_name: str
    business_color: Optional[str] = None
    latest_bp_id: Optional[int] = None
    year: Optional[int] = None
    status: Optional[BPStatus] = None
    total_ingresos_plan: Optional[float] = None
    total_costos_plan: Optional[float] = None
    margen_bruto_plan: Optional[float] = None
    activities_total: int = 0
    activities_completed: int = 0
    activities_overdue: int = 0
    completion_pct: float = 0.0


class BPDashboardStats(BaseModel):
    total_bps: int
    total_businesses_with_bp: int
    total_activities: int
    total_overdue: int
    by_status: dict
    businesses: list[BPBusinessSummary]


# ─── BPChecklist ──────────────────────────────────────────────────────────────

class BPChecklistItemCreate(BaseModel):
    title: str
    order_index: int = 0


class BPChecklistItemUpdate(BaseModel):
    title: Optional[str] = None
    is_completed: Optional[bool] = None
    order_index: Optional[int] = None


class BPChecklistItemResponse(BaseModel):
    id: int
    activity_id: int
    title: str
    is_completed: bool
    completed_at: Optional[datetime] = None
    completed_by_id: Optional[int] = None
    order_index: int
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── BPComment ────────────────────────────────────────────────────────────────

class BPCommentCreate(BaseModel):
    content: str


class BPCommentResponse(BaseModel):
    id: int
    activity_id: int
    author_id: int
    author_name: str = ""
    content: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ─── BPMilestone ──────────────────────────────────────────────────────────────

class BPMilestoneCreate(BaseModel):
    title: str
    description: Optional[str] = None
    target_date: date
    color: str = "#6366f1"
    order_index: int = 0


class BPMilestoneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[date] = None
    status: Optional[str] = None
    color: Optional[str] = None
    order_index: Optional[int] = None


class BPMilestoneResponse(BaseModel):
    id: int
    bp_id: int
    title: str
    description: Optional[str] = None
    target_date: date
    status: str
    color: str
    order_index: int
    created_at: datetime
    model_config = {"from_attributes": True}
