from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, func, delete
from app.core.deps import DB, AdminUser, LeaderOrAdmin
from app.models.business import Business
from app.models.catalog import Priority, TaskStatus, IncidentCategory
from app.models.user import User
from app.models.incident import Incident
from app.models.project import Project
from app.models.service_config import ServiceConfig
from app.schemas.business import BusinessCreate, BusinessUpdate, BusinessResponse
from app.schemas.service_config import (
    ServiceConfigUpdate, ServiceFieldInfo, ServiceValueResponse, ServiceResponse,
)
from app.core.service_registry import SERVICE_REGISTRY
from app.core.config import settings, _ENV_FALLBACK_MAP

router = APIRouter(prefix="/admin", tags=["Administración"])


# ─── Businesses ───────────────────────────────────────────────────────────────

@router.get("/businesses", response_model=List[BusinessResponse])
async def list_businesses(db: DB, admin: LeaderOrAdmin):
    result = await db.execute(select(Business).order_by(Business.name))
    return result.scalars().all()


@router.post("/businesses", response_model=BusinessResponse, status_code=201)
async def create_business(payload: BusinessCreate, db: DB, admin: LeaderOrAdmin):
    existing = await db.execute(select(Business).where(Business.name == payload.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya existe un negocio con ese nombre")
    biz = Business(name=payload.name, description=payload.description, color=payload.color)
    db.add(biz)
    await db.flush()
    await db.refresh(biz)
    return biz


@router.patch("/businesses/{biz_id}", response_model=BusinessResponse)
async def update_business(biz_id: int, payload: BusinessUpdate, db: DB, admin: LeaderOrAdmin):
    result = await db.execute(select(Business).where(Business.id == biz_id))
    biz = result.scalar_one_or_none()
    if not biz:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(biz, field, value)
    await db.flush()
    await db.refresh(biz)
    return biz


# ─── Priorities ───────────────────────────────────────────────────────────────

@router.get("/priorities")
async def list_priorities(db: DB, admin: LeaderOrAdmin):
    result = await db.execute(select(Priority).order_by(Priority.order_index))
    return result.scalars().all()


@router.post("/priorities", status_code=201)
async def create_priority(name: str, color: str, order_index: int, db: DB, admin: LeaderOrAdmin):
    p = Priority(name=name, color=color, order_index=order_index)
    db.add(p)
    await db.flush()
    await db.refresh(p)
    return p


# ─── Task Statuses ────────────────────────────────────────────────────────────

@router.get("/task-statuses")
async def list_task_statuses(db: DB, admin: LeaderOrAdmin, project_id: Optional[int] = None):
    query = select(TaskStatus).where(TaskStatus.is_active == True)
    if project_id:
        query = query.where(
            (TaskStatus.project_id == project_id) | (TaskStatus.project_id == None)
        )
    else:
        query = query.where(TaskStatus.project_id == None)
    query = query.order_by(TaskStatus.order_index)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/task-statuses", status_code=201)
async def create_task_status(
    name: str, color: str, order_index: int, is_done_state: bool,
    db: DB, admin: LeaderOrAdmin, project_id: Optional[int] = None
):
    ts = TaskStatus(
        name=name, color=color, order_index=order_index,
        is_done_state=is_done_state, project_id=project_id
    )
    db.add(ts)
    await db.flush()
    await db.refresh(ts)
    return ts


# ─── Incident Categories ──────────────────────────────────────────────────────

@router.get("/incident-categories")
async def list_incident_categories(db: DB, admin: LeaderOrAdmin):
    result = await db.execute(select(IncidentCategory).where(IncidentCategory.is_active == True))
    return result.scalars().all()


@router.post("/incident-categories", status_code=201)
async def create_incident_category(
    name: str, description: Optional[str], color: str, db: DB, admin: LeaderOrAdmin
):
    cat = IncidentCategory(name=name, description=description, color=color)
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


# ─── Dashboard Stats ──────────────────────────────────────────────────────────

@router.get("/stats")
async def get_admin_stats(db: DB, admin: LeaderOrAdmin):
    total_users = await db.execute(select(func.count(User.id)))
    active_users = await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )
    active_projects = await db.execute(
        select(func.count(Project.id)).where(
            Project.status == "activo", Project.is_deleted == False
        )
    )
    open_incidents = await db.execute(
        select(func.count(Incident.id)).where(
            Incident.status.in_(["abierto", "en_investigacion"]),
            Incident.is_deleted == False,
        )
    )
    critical_incidents = await db.execute(
        select(func.count(Incident.id)).where(
            Incident.severity == "critico",
            Incident.status.in_(["abierto", "en_investigacion"]),
            Incident.is_deleted == False,
        )
    )

    return {
        "total_users": total_users.scalar(),
        "active_users": active_users.scalar(),
        "active_projects": active_projects.scalar(),
        "open_incidents": open_incidents.scalar(),
        "critical_incidents": critical_incidents.scalar(),
    }


# ─── Integrations / API Keys ────────────────────────────────────────────────

def _mask_value(value: str, field_type: str) -> str:
    """Enmascara valores sensibles mostrando solo los últimos 4 caracteres."""
    if field_type != "password" or not value:
        return value
    if len(value) <= 4:
        return "****"
    return "****" + value[-4:]


def _get_env_value(service_name: str, key_name: str) -> Optional[str]:
    env_attr = _ENV_FALLBACK_MAP.get((service_name, key_name))
    if env_attr:
        val = getattr(settings, env_attr, None)
        return val if val else None
    return None


@router.get("/integrations", response_model=List[ServiceResponse])
async def list_integrations(db: DB, admin: AdminUser):
    result = await db.execute(
        select(ServiceConfig).order_by(ServiceConfig.service_name)
    )
    db_configs = result.scalars().all()

    db_map = {}
    for cfg in db_configs:
        db_map.setdefault(cfg.service_name, {})[cfg.key_name] = cfg

    services = []
    for svc_name, svc_info in SERVICE_REGISTRY.items():
        svc_configs = db_map.get(svc_name, {})

        values = []
        all_required_set = True
        any_value_set = False
        latest_update = None

        for field in svc_info["fields"]:
            db_cfg = svc_configs.get(field["key_name"])
            env_val = _get_env_value(svc_name, field["key_name"])

            if db_cfg and db_cfg.key_value:
                raw_value = db_cfg.key_value
                source = "database"
                has_value = True
                if db_cfg.updated_at and (latest_update is None or db_cfg.updated_at > latest_update):
                    latest_update = db_cfg.updated_at
            elif env_val:
                raw_value = env_val
                source = "env"
                has_value = True
            else:
                raw_value = None
                source = None
                has_value = False

            if field.get("required") and not has_value:
                all_required_set = False
            if has_value:
                any_value_set = True

            values.append(ServiceValueResponse(
                key_name=field["key_name"],
                masked_value=_mask_value(raw_value, field["field_type"]) if raw_value else None,
                has_value=has_value,
                field_type=field["field_type"],
                source=source,
            ))

        fields = [
            ServiceFieldInfo(
                key_name=f["key_name"],
                label=f["label"],
                field_type=f["field_type"],
                required=f.get("required", False),
                placeholder=f.get("placeholder", ""),
                default=f.get("default"),
            )
            for f in svc_info["fields"]
        ]

        is_active = any(c.is_active for c in svc_configs.values()) if svc_configs else False

        services.append(ServiceResponse(
            service_name=svc_name,
            display_name=svc_info["display_name"],
            description=svc_info["description"],
            icon=svc_info["icon"],
            is_active=is_active or (any_value_set and all_required_set),
            is_configured=all_required_set and any_value_set,
            fields=fields,
            values=values,
            updated_at=latest_update,
        ))

    return services


@router.put("/integrations/{service_name}", response_model=dict)
async def update_integration(
    service_name: str, payload: ServiceConfigUpdate, db: DB, admin: AdminUser
):
    if service_name not in SERVICE_REGISTRY:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    valid_keys = {f["key_name"] for f in SERVICE_REGISTRY[service_name]["fields"]}

    for key_name, value in payload.values.items():
        if key_name not in valid_keys:
            continue

        existing = await db.execute(
            select(ServiceConfig).where(
                ServiceConfig.service_name == service_name,
                ServiceConfig.key_name == key_name,
            )
        )
        cfg = existing.scalar_one_or_none()

        if not value.strip():
            if cfg:
                await db.delete(cfg)
            continue

        if cfg:
            cfg.key_value = value.strip()
            cfg.is_active = payload.is_active
        else:
            db.add(ServiceConfig(
                service_name=service_name,
                key_name=key_name,
                key_value=value.strip(),
                is_active=payload.is_active,
            ))

    await db.flush()
    return {"message": f"Configuración de {service_name} actualizada"}


@router.delete("/integrations/{service_name}", status_code=204)
async def delete_integration(service_name: str, db: DB, admin: AdminUser):
    if service_name not in SERVICE_REGISTRY:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    await db.execute(
        delete(ServiceConfig).where(ServiceConfig.service_name == service_name)
    )
    await db.flush()


@router.post("/integrations/{service_name}/test")
async def test_integration(service_name: str, db: DB, admin: AdminUser):
    if service_name not in SERVICE_REGISTRY:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    from app.core.config import get_service_config_value
    import httpx

    try:
        api_key = await get_service_config_value(db, service_name, "api_key")
        if not api_key:
            return {"success": False, "message": "No hay API key configurada"}

        async with httpx.AsyncClient(timeout=5.0) as client:
            if service_name == "resend":
                resp = await client.get(
                    "https://api.resend.com/domains",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                if resp.status_code == 200:
                    return {"success": True, "message": "Conexión exitosa con Resend"}
                return {"success": False, "message": f"Error Resend: {resp.status_code}"}

            elif service_name == "sendgrid":
                resp = await client.get(
                    "https://api.sendgrid.com/v3/scopes",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                if resp.status_code == 200:
                    return {"success": True, "message": "Conexión exitosa con SendGrid"}
                return {"success": False, "message": f"Error SendGrid: {resp.status_code}"}

            elif service_name == "ultra":
                instance_id = await get_service_config_value(db, service_name, "instance_id")
                if not instance_id:
                    return {"success": False, "message": "Falta Instance ID"}
                resp = await client.get(
                    f"https://api.ultramsg.com/{instance_id}/instance/status",
                    params={"token": api_key},
                )
                if resp.status_code == 200:
                    return {"success": True, "message": "Conexión exitosa con Ultra MSG"}
                return {"success": False, "message": f"Error Ultra MSG: {resp.status_code}"}

            elif service_name == "gemini":
                resp = await client.get(
                    f"https://generativelanguage.googleapis.com/v1/models?key={api_key}",
                )
                if resp.status_code == 200:
                    return {"success": True, "message": "Conexión exitosa con Gemini"}
                return {"success": False, "message": f"Error Gemini: {resp.status_code}"}

            elif service_name == "lite":
                return {"success": True, "message": "API key guardada (sin endpoint de prueba disponible)"}

            elif service_name == "elevenlabs":
                key_preview = api_key[:8] + "..." + api_key[-4:] if len(api_key) > 12 else "***"
                # Try /v1/user first (works on all plans)
                resp = await client.get(
                    "https://api.elevenlabs.io/v1/user",
                    headers={"xi-api-key": api_key},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    tier = data.get("subscription", {}).get("tier", "unknown")
                    chars_used = data.get("subscription", {}).get("character_count", 0)
                    chars_limit = data.get("subscription", {}).get("character_limit", 0)
                    return {
                        "success": True,
                        "message": f"ElevenLabs OK · Plan: {tier} · Caracteres: {chars_used:,}/{chars_limit:,}"
                    }
                # Parse ElevenLabs error detail for better diagnosis
                try:
                    err_detail = resp.json().get("detail", {})
                    if isinstance(err_detail, dict):
                        err_msg = err_detail.get("message", str(err_detail))
                    else:
                        err_msg = str(err_detail)
                except Exception:
                    err_msg = resp.text[:100]
                return {
                    "success": False,
                    "message": f"ElevenLabs {resp.status_code} · key usada: {key_preview} · {err_msg}"
                }

            elif service_name == "whisper":
                # Whisper runs locally, just confirm the model setting was saved
                from app.core.config import get_service_config_value
                model = await get_service_config_value(db, "whisper", "model") or "base"
                return {"success": True, "message": f"Modelo Whisper configurado: {model} (se cargará en el próximo uso)"}

            return {"success": False, "message": "Test no implementado para este servicio"}

    except httpx.TimeoutException:
        return {"success": False, "message": "Timeout: el servicio no respondió en 5 segundos"}
    except Exception as e:
        return {"success": False, "message": f"Error de conexión: {str(e)}"}
