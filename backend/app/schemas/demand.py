from typing import Dict, List, Optional, Any
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, EmailStr


# ─── Catalog ─────────────────────────────────────────────────────────────────

class DemandCatalogCreate(BaseModel):
    catalog_type: str
    name: str
    description: Optional[str] = None
    value: Optional[str] = None
    order_index: int = 0
    parent_id: Optional[int] = None


class DemandCatalogUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    value: Optional[str] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None


class DemandCatalogResponse(BaseModel):
    id: int
    catalog_type: str
    name: str
    description: Optional[str] = None
    value: Optional[str] = None
    order_index: int
    is_active: bool
    parent_id: Optional[int] = None

    model_config = {"from_attributes": True}


# ─── Custom Fields ───────────────────────────────────────────────────────────

class DemandCustomFieldCreate(BaseModel):
    field_name: str
    field_label: str
    field_type: str
    options: Optional[str] = None  # JSON string
    is_required: bool = False
    order_index: int = 0
    section: str = "general"
    placeholder: Optional[str] = None
    help_text: Optional[str] = None


class DemandCustomFieldUpdate(BaseModel):
    field_label: Optional[str] = None
    field_type: Optional[str] = None
    options: Optional[str] = None
    is_required: Optional[bool] = None
    is_active: Optional[bool] = None
    order_index: Optional[int] = None
    section: Optional[str] = None
    placeholder: Optional[str] = None
    help_text: Optional[str] = None


class DemandCustomFieldResponse(BaseModel):
    id: int
    field_name: str
    field_label: str
    field_type: str
    options: Optional[str] = None
    is_required: bool
    is_active: bool
    order_index: int
    section: str
    placeholder: Optional[str] = None
    help_text: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── Timeline ────────────────────────────────────────────────────────────────

class DemandTimelineCreate(BaseModel):
    action: str
    description: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None


class DemandTimelineResponse(BaseModel):
    id: int
    demand_id: int
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    action: str
    description: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Meeting Notes ───────────────────────────────────────────────────────────

class DemandMeetingNoteCreate(BaseModel):
    title: str
    content: Optional[str] = None
    meeting_date: datetime
    attendees: Optional[str] = None  # JSON
    action_items: Optional[str] = None  # JSON
    next_meeting_date: Optional[datetime] = None


class DemandMeetingNoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    meeting_date: Optional[datetime] = None
    attendees: Optional[str] = None
    action_items: Optional[str] = None
    next_meeting_date: Optional[datetime] = None


class DemandMeetingNoteResponse(BaseModel):
    id: int
    demand_id: int
    title: str
    content: Optional[str] = None
    meeting_date: datetime
    attendees: Optional[str] = None
    action_items: Optional[str] = None
    next_meeting_date: Optional[datetime] = None
    reminder_sent: bool
    created_by_id: int
    created_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Requirements ────────────────────────────────────────────────────────────

class DemandRequirementCreate(BaseModel):
    item_number: int
    modulo_impactado: Optional[str] = None
    descripcion_requerimiento: Optional[str] = None
    quien: Optional[str] = None
    que: Optional[str] = None
    criterios_aceptacion: Optional[str] = None
    observaciones: Optional[str] = None


class DemandRequirementUpdate(BaseModel):
    modulo_impactado: Optional[str] = None
    descripcion_requerimiento: Optional[str] = None
    quien: Optional[str] = None
    que: Optional[str] = None
    criterios_aceptacion: Optional[str] = None
    observaciones: Optional[str] = None
    status: Optional[str] = None


class DemandRequirementResponse(BaseModel):
    id: int
    demand_id: int
    item_number: int
    modulo_impactado: Optional[str] = None
    descripcion_requerimiento: Optional[str] = None
    quien: Optional[str] = None
    que: Optional[str] = None
    criterios_aceptacion: Optional[str] = None
    observaciones: Optional[str] = None
    status: str
    order_index: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Demand Request ──────────────────────────────────────────────────────────

class DemandRequestCreate(BaseModel):
    title: str
    vicepresidencia_id: Optional[int] = None
    telefono_contacto: Optional[str] = None
    enfoque: Optional[str] = None  # JSON
    aplicaciones: Optional[str] = None  # JSON
    situacion_actual: Optional[str] = None
    pilares_estrategicos_id: Optional[int] = None
    justificacion_pilares: Optional[str] = None
    mejoras_procesos_id: Optional[int] = None
    descripcion_procesos: Optional[str] = None
    usuarios_impactados_id: Optional[int] = None
    detalle_clientes_impactados: Optional[str] = None
    reduce_riesgo_id: Optional[int] = None
    explicacion_riesgo: Optional[str] = None
    oportunidad_negocio: Optional[str] = None
    beneficio_tipo: Optional[str] = None
    beneficio_monto_estimado: Optional[Decimal] = None
    sponsor_name: Optional[str] = None
    lider_proceso_name: Optional[str] = None
    responsable_negocio_name: Optional[str] = None
    responsable_negocio_email: Optional[str] = None
    impacta_sox: Optional[bool] = None
    sox_detalle: Optional[str] = None
    es_regulatorio: Optional[bool] = None
    regulatorio_detalle: Optional[str] = None
    tiene_deadline: bool = False
    fecha_deadline: Optional[date] = None
    impacto_no_ejecutar: Optional[str] = None
    detalle_requerimientos: Optional[str] = None
    migracion_datos: Optional[str] = None
    parent_demand_id: Optional[int] = None
    business_id: Optional[int] = None
    source_incident_id: Optional[int] = None
    custom_fields: Optional[str] = None  # JSON
    tags: Optional[str] = None


class DemandRequestUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    radicado: Optional[str] = None
    assigned_to_id: Optional[int] = None
    vicepresidencia_id: Optional[int] = None
    telefono_contacto: Optional[str] = None
    enfoque: Optional[str] = None
    aplicaciones: Optional[str] = None
    situacion_actual: Optional[str] = None
    pilares_estrategicos_id: Optional[int] = None
    justificacion_pilares: Optional[str] = None
    mejoras_procesos_id: Optional[int] = None
    descripcion_procesos: Optional[str] = None
    usuarios_impactados_id: Optional[int] = None
    detalle_clientes_impactados: Optional[str] = None
    reduce_riesgo_id: Optional[int] = None
    explicacion_riesgo: Optional[str] = None
    oportunidad_negocio: Optional[str] = None
    beneficio_tipo: Optional[str] = None
    beneficio_monto_estimado: Optional[Decimal] = None
    beneficio_monto_real: Optional[Decimal] = None
    sponsor_name: Optional[str] = None
    lider_proceso_name: Optional[str] = None
    responsable_negocio_name: Optional[str] = None
    responsable_negocio_email: Optional[str] = None
    impacta_sox: Optional[bool] = None
    sox_detalle: Optional[str] = None
    es_regulatorio: Optional[bool] = None
    regulatorio_detalle: Optional[str] = None
    tiene_deadline: Optional[bool] = None
    fecha_deadline: Optional[date] = None
    impacto_no_ejecutar: Optional[str] = None
    detalle_requerimientos: Optional[str] = None
    migracion_datos: Optional[str] = None
    parent_demand_id: Optional[int] = None
    related_project_id: Optional[int] = None
    business_id: Optional[int] = None
    custom_fields: Optional[str] = None
    tags: Optional[str] = None


class DemandCatalogInfo(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class UserInfo(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    model_config = {"from_attributes": True}


class DemandRequestResponse(BaseModel):
    id: int
    demand_number: str
    radicado: Optional[str] = None
    title: str
    status: str

    vicepresidencia_id: Optional[int] = None
    vicepresidencia: Optional[DemandCatalogInfo] = None
    telefono_contacto: Optional[str] = None
    enfoque: Optional[str] = None
    aplicaciones: Optional[str] = None
    situacion_actual: Optional[str] = None
    pilares_estrategicos_id: Optional[int] = None
    pilares_estrategicos: Optional[DemandCatalogInfo] = None
    justificacion_pilares: Optional[str] = None
    mejoras_procesos_id: Optional[int] = None
    mejoras_procesos: Optional[DemandCatalogInfo] = None
    descripcion_procesos: Optional[str] = None
    usuarios_impactados_id: Optional[int] = None
    usuarios_impactados: Optional[DemandCatalogInfo] = None
    detalle_clientes_impactados: Optional[str] = None
    reduce_riesgo_id: Optional[int] = None
    reduce_riesgo: Optional[DemandCatalogInfo] = None
    explicacion_riesgo: Optional[str] = None
    oportunidad_negocio: Optional[str] = None

    beneficio_tipo: Optional[str] = None
    beneficio_monto_estimado: Optional[Decimal] = None
    beneficio_monto_real: Optional[Decimal] = None

    sponsor_name: Optional[str] = None
    lider_proceso_name: Optional[str] = None
    responsable_negocio_name: Optional[str] = None
    responsable_negocio_email: Optional[str] = None

    impacta_sox: Optional[bool] = None
    sox_detalle: Optional[str] = None
    es_regulatorio: Optional[bool] = None
    regulatorio_detalle: Optional[str] = None
    tiene_deadline: bool = False
    fecha_deadline: Optional[date] = None
    impacto_no_ejecutar: Optional[str] = None
    detalle_requerimientos: Optional[str] = None
    migracion_datos: Optional[str] = None

    created_by_id: int
    created_by: Optional[UserInfo] = None
    assigned_to_id: Optional[int] = None
    assigned_to: Optional[UserInfo] = None
    business_id: Optional[int] = None
    parent_demand_id: Optional[int] = None
    related_project_id: Optional[int] = None
    source_incident_id: Optional[int] = None
    custom_fields: Optional[str] = None
    attachments: Optional[str] = None
    tags: Optional[str] = None

    children_count: int = 0
    requirements_count: int = 0
    timeline_count: int = 0

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DemandRequestDetail(DemandRequestResponse):
    timeline: List[DemandTimelineResponse] = []
    meeting_notes: List[DemandMeetingNoteResponse] = []
    requirements: List[DemandRequirementResponse] = []


# ─── Dashboard ───────────────────────────────────────────────────────────────

class DemandDashboardStats(BaseModel):
    total: int = 0
    by_status: Dict[str, int] = {}
    by_month: List[Dict[str, Any]] = []
    by_vicepresidencia: List[Dict[str, Any]] = []
    by_responsable: List[Dict[str, Any]] = []
    avg_days_by_status: Dict[str, float] = {}
    aging: Dict[str, int] = {}  # >30, >60, >90
    economic_impact: Dict[str, Any] = {}
    sla_compliance: float = 0.0
    delayed_demands: List[Dict[str, Any]] = []
    monthly_comparison: List[Dict[str, Any]] = []
