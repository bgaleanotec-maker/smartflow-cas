"""AI Chat endpoint - WhatsApp-style assistant that can create entities."""
from typing import Optional, List
from datetime import date, datetime
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select, func
from app.core.deps import DB, CurrentUser
from app.core.config import get_service_config_value
from app.models.task import Task
from app.models.demand import DemandRequest, DemandStatus
from app.models.lean_pro import DailyStandup
from app.models.activities import RecurringActivity, ActivityInstance, ActivityStatus
from app.models.business_intel import HechoRelevante
from app.models.incident import Incident
from app.models.project import Project
import httpx
import json
import re

router = APIRouter(prefix="/ai/chat", tags=["AI Chat"])


class ChatMessage(BaseModel):
    message: str
    history: Optional[List[dict]] = None  # [{role, content}]


class ChatAction(BaseModel):
    type: str  # "message", "create_task", "create_demand", "create_activity", "create_hecho", "standup", "summary"
    data: Optional[dict] = None
    message: str


@router.post("")
async def ai_chat(payload: ChatMessage, db: DB, user: CurrentUser):
    """Process chat message - detect intent and execute actions or respond."""
    msg = payload.message.lower().strip()

    # ─── Quick actions (no AI needed) ────────────────────────────────
    # Standup shortcut
    if any(kw in msg for kw in ["standup", "daily", "gerenciamiento", "que hice"]):
        return _standup_helper(msg)

    # Summary request
    if any(kw in msg for kw in ["resumen", "summary", "como va", "estado"]):
        return await _get_summary(db, user)

    # Create task
    if any(kw in msg for kw in ["crear tarea", "nueva tarea", "crea una tarea", "agrega tarea"]):
        return _parse_task(msg)

    # Create activity
    if any(kw in msg for kw in ["crear actividad", "nueva actividad", "recordatorio", "actividad recurrente"]):
        return _parse_activity(msg)

    # Create demand
    if any(kw in msg for kw in ["crear demanda", "nueva demanda", "registrar demanda"]):
        return _parse_demand(msg)

    # Create hecho
    if any(kw in msg for kw in ["hecho relevante", "nuevo hecho", "registrar hecho"]):
        return _parse_hecho(msg)

    # Help
    if any(kw in msg for kw in ["ayuda", "help", "que puedo", "comandos"]):
        return {
            "action": "message",
            "message": "**Puedo ayudarte con:**\n\n"
                "- **\"Crear tarea [titulo]\"** - Crea una tarea nueva\n"
                "- **\"Crear demanda [titulo]\"** - Inicia una demanda TI\n"
                "- **\"Crear actividad [titulo] semanal\"** - Actividad recurrente\n"
                "- **\"Hecho relevante [descripcion]\"** - Registra un hecho\n"
                "- **\"Standup: hice X, hare Y, bloqueado por Z\"** - Gerenciamiento diario\n"
                "- **\"Resumen\"** - Estado actual del sistema\n"
                "- **Cualquier pregunta** - Te asesoro con IA\n\n"
                "Escribe de forma natural, como en WhatsApp.",
        }

    # ─── AI-powered response ─────────────────────────────────────────
    return await _ai_response(payload.message, db, user, payload.history)


def _standup_helper(msg: str) -> dict:
    """Parse standup from natural language."""
    parts = {"what_did": "", "what_will": "", "blockers": ""}

    # Try to parse "hice X, hare Y, bloqueado Z"
    if "hice" in msg:
        match = re.search(r'hice\s+(.+?)(?:,|\.|\bhare\b|\bbloq)', msg, re.I)
        if match:
            parts["what_did"] = match.group(1).strip()
    if "hare" in msg or "haré" in msg:
        match = re.search(r'har[eé]\s+(.+?)(?:,|\.|\bbloq|$)', msg, re.I)
        if match:
            parts["what_will"] = match.group(1).strip()
    if "bloq" in msg:
        match = re.search(r'bloq\w*\s+(?:por\s+)?(.+?)(?:\.|$)', msg, re.I)
        if match:
            parts["blockers"] = match.group(1).strip()

    if parts["what_did"] or parts["what_will"]:
        return {
            "action": "create_standup",
            "data": parts,
            "message": f"Registrare tu standup:\n- **Hice:** {parts['what_did'] or '(vacio)'}\n- **Hare:** {parts['what_will'] or '(vacio)'}\n- **Bloqueantes:** {parts['blockers'] or 'Ninguno'}\n\n¿Confirmas?",
        }
    return {
        "action": "message",
        "message": "Para registrar tu standup escribe algo como:\n*\"Standup: hice la revision de incidentes, hare el seguimiento de demandas, bloqueado por falta de acceso al servidor\"*",
    }


def _parse_task(msg: str) -> dict:
    """Parse task creation from natural language."""
    title = msg
    for prefix in ["crear tarea", "nueva tarea", "crea una tarea", "agrega tarea"]:
        title = title.replace(prefix, "").strip()
    title = title.strip(": ").capitalize()
    if not title:
        return {"action": "message", "message": "Dime el titulo de la tarea. Ej: *\"Crear tarea Revisar incidentes pendientes\"*"}
    return {
        "action": "create_task",
        "data": {"title": title},
        "message": f"Creare la tarea: **{title}**\n\n¿Confirmas? (Puedes agregar mas detalles despues)",
    }


def _parse_activity(msg: str) -> dict:
    """Parse activity creation."""
    title = msg
    for prefix in ["crear actividad", "nueva actividad", "recordatorio", "actividad recurrente"]:
        title = title.replace(prefix, "").strip()

    freq = "semanal"
    for f in ["diaria", "semanal", "mensual", "quincenal", "unica"]:
        if f in title:
            freq = f
            title = title.replace(f, "").strip()

    title = title.strip(": ").capitalize()
    if not title:
        return {"action": "message", "message": "Dime el titulo. Ej: *\"Crear actividad Revision de KPIs semanal\"*"}
    return {
        "action": "create_activity",
        "data": {"title": title, "frequency": freq},
        "message": f"Creare la actividad: **{title}** ({freq})\n\n¿Confirmas?",
    }


def _parse_demand(msg: str) -> dict:
    """Parse demand creation."""
    title = msg
    for prefix in ["crear demanda", "nueva demanda", "registrar demanda"]:
        title = title.replace(prefix, "").strip()
    title = title.strip(": ").capitalize()
    if not title:
        return {"action": "message", "message": "Dime el titulo de la demanda. Ej: *\"Crear demanda Integracion con sistema SAP\"*"}
    return {
        "action": "create_demand",
        "data": {"title": title},
        "message": f"Creare la demanda: **{title}**\n\nDespues podras completar el formulario con los detalles. ¿Confirmas?",
    }


def _parse_hecho(msg: str) -> dict:
    """Parse hecho relevante."""
    title = msg
    for prefix in ["hecho relevante", "nuevo hecho", "registrar hecho"]:
        title = title.replace(prefix, "").strip()
    title = title.strip(": ").capitalize()
    if not title:
        return {"action": "message", "message": "Dime el hecho. Ej: *\"Hecho relevante Se cerro acuerdo con nuevo aliado comercial\"*"}
    return {
        "action": "create_hecho",
        "data": {"title": title},
        "message": f"Registrare el hecho: **{title}**\n\n¿Confirmas?",
    }


async def _get_summary(db, user) -> dict:
    """Get system summary."""
    today = date.today()

    tasks_count = (await db.execute(select(func.count(Task.id)).where(Task.is_deleted == False))).scalar()
    demands_count = (await db.execute(select(func.count(DemandRequest.id)).where(DemandRequest.is_deleted == False))).scalar()
    incidents_open = (await db.execute(
        select(func.count(Incident.id)).where(Incident.is_deleted == False, Incident.status.in_(["abierto", "en_investigacion"]))
    )).scalar()
    activities_pending = (await db.execute(
        select(func.count(ActivityInstance.id)).where(ActivityInstance.status.in_([ActivityStatus.SIN_INICIAR, ActivityStatus.EN_PROCESO]))
    )).scalar()
    activities_overdue = (await db.execute(
        select(func.count(ActivityInstance.id)).where(
            ActivityInstance.due_date < today,
            ActivityInstance.status.in_([ActivityStatus.SIN_INICIAR, ActivityStatus.EN_PROCESO])
        )
    )).scalar()

    return {
        "action": "message",
        "message": f"**Resumen del Sistema:**\n\n"
            f"- **Tareas:** {tasks_count} totales\n"
            f"- **Demandas:** {demands_count} registradas\n"
            f"- **Incidentes abiertos:** {incidents_open}\n"
            f"- **Actividades pendientes:** {activities_pending}\n"
            f"- **Actividades vencidas:** {activities_overdue}\n\n"
            f"{'**Atencion:** Hay ' + str(activities_overdue) + ' actividades vencidas que requieren accion.' if activities_overdue > 0 else 'Todo bajo control.'}",
    }


async def _ai_response(message: str, db, user, history=None) -> dict:
    """Get AI response for general questions."""
    api_key = await get_service_config_value(db, "gemini", "api_key")

    if not api_key:
        return {
            "action": "message",
            "message": "Soy tu asistente de SmartFlow. Puedo ayudarte a:\n\n"
                "- Crear tareas, demandas, actividades\n"
                "- Registrar tu standup diario\n"
                "- Consultar el resumen del sistema\n"
                "- Registrar hechos relevantes\n\n"
                "Escribe **\"ayuda\"** para ver todos los comandos.\n\n"
                "*Para respuestas con IA, configura Gemini en Admin > Integraciones.*",
        }

    model = await get_service_config_value(db, "gemini", "model") or "gemini-pro"
    system = (
        "Eres SmartFlow AI, asistente de gestion para CAS BO en Vanti. "
        "Respondes en espanol, de forma concisa y util. "
        "Puedes ayudar con gestion de proyectos, demandas TI, incidentes, "
        "metodologia Lean/Scrum, y recomendaciones de mejora continua. "
        f"El usuario es {user.full_name} con rol {user.role.value}."
    )

    contents = [{"parts": [{"text": system + "\n\nUsuario: " + message}]}]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={api_key}",
                json={"contents": contents, "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1024}},
            )
            if resp.status_code == 200:
                data = resp.json()
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return {"action": "message", "message": text, "source": "gemini"}
    except Exception:
        pass

    return {"action": "message", "message": "No pude procesar tu solicitud. Intenta de nuevo o escribe **ayuda**."}


# ─── Execute confirmed actions ───────────────────────────────────────────

class ActionConfirm(BaseModel):
    action_type: str
    data: dict


@router.post("/execute")
async def execute_action(payload: ActionConfirm, db: DB, user: CurrentUser):
    """Execute a confirmed action from the chat."""
    if payload.action_type == "create_task":
        task_number = f"TSK-{(await db.execute(select(func.count(Task.id)))).scalar() + 1:04d}"
        task = Task(
            task_number=task_number, title=payload.data["title"],
            reporter_id=user.id, assignee_id=user.id,
        )
        db.add(task)
        await db.flush()
        return {"success": True, "message": f"Tarea **{task_number}** creada: {payload.data['title']}", "id": task.id, "redirect": f"/projects"}

    elif payload.action_type == "create_demand":
        demand_number = f"GD-{(await db.execute(select(func.count(DemandRequest.id)))).scalar() + 1:04d}"
        demand = DemandRequest(
            demand_number=demand_number, title=payload.data["title"],
            created_by_id=user.id,
        )
        db.add(demand)
        await db.flush()
        return {"success": True, "message": f"Demanda **{demand_number}** creada: {payload.data['title']}", "id": demand.id, "redirect": f"/demands/{demand.id}"}

    elif payload.action_type == "create_activity":
        from app.models.activities import RecurringActivity, ActivityInstance
        from datetime import timedelta
        activity = RecurringActivity(
            title=payload.data["title"], frequency=payload.data.get("frequency", "semanal"),
            start_date=date.today(), created_by_id=user.id,
        )
        db.add(activity)
        await db.flush()
        # Generate first instance
        db.add(ActivityInstance(activity_id=activity.id, title=activity.title, due_date=date.today()))
        await db.flush()
        return {"success": True, "message": f"Actividad creada: {payload.data['title']} ({payload.data.get('frequency', 'semanal')})", "id": activity.id, "redirect": "/torre-control"}

    elif payload.action_type == "create_hecho":
        from datetime import date as d
        today = d.today()
        week = today.isocalendar()[1]
        hecho = HechoRelevante(
            title=payload.data["title"], week_number=week, year=today.year,
            created_by_id=user.id,
        )
        db.add(hecho)
        await db.flush()
        return {"success": True, "message": f"Hecho registrado: {payload.data['title']}", "id": hecho.id, "redirect": "/hechos"}

    elif payload.action_type == "create_standup":
        standup = DailyStandup(
            user_id=user.id, standup_date=date.today(),
            what_did=payload.data.get("what_did", ""),
            what_will=payload.data.get("what_will", ""),
            blockers=payload.data.get("blockers", ""),
        )
        db.add(standup)
        await db.flush()
        return {"success": True, "message": "Standup registrado correctamente", "redirect": "/lean-pro"}

    return {"success": False, "message": "Accion no reconocida"}
