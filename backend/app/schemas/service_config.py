from typing import Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel


class ServiceConfigUpdate(BaseModel):
    values: Dict[str, str]
    is_active: bool = True


class ServiceFieldInfo(BaseModel):
    key_name: str
    label: str
    field_type: str
    required: bool
    placeholder: str
    default: Optional[str] = None


class ServiceValueResponse(BaseModel):
    key_name: str
    masked_value: Optional[str] = None
    has_value: bool = False
    field_type: str = "text"
    source: Optional[str] = None  # "database" or "env"


class ServiceResponse(BaseModel):
    service_name: str
    display_name: str
    description: str
    icon: str
    is_active: bool = False
    is_configured: bool = False
    fields: List[ServiceFieldInfo]
    values: List[ServiceValueResponse]
    updated_at: Optional[datetime] = None
