"""
Executive C-Suite Dashboard router — ARIA Directiva
Endpoints for the VP-level executive view of the CAS business.
"""
from datetime import datetime, date
from typing import Optional
import httpx

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.deps import DB, DirectivoOrAdmin
from app.models.business_plan import (
    BusinessPlan, BPLine, BPActivity, BPRecommendation,
    BPStatus, BPLineCategory, BPActivityStatus,
)
from app.models.bp_financial_ai import BPScenario
from app.models.incident import Incident, IncidentSeverity, IncidentStatus
from app.models.project import Project, ProjectStatus
from app.models.user import User, UserRole
from app.models.business import Business

router = APIRouter(prefix="/executive", tags=["Executive Dashboard"])

# ─── ARIA Executive System Prompt ────────────────────────────────────────────

ARIA_EXECUTIVE_PROMPT = """
Eres ARIA en modo DIRECTIVO — analista financiero estratégico de nivel C-suite para la Vicepresidencia de Vanti.

REGLA ABSOLUTAMENTE INQUEBRANTABLE — SIN EXCEPCIONES:
════════════════════════════════════════════════════════
Solo puedes afirmar hechos que estén EXPLÍCITAMENTE en los datos del sistema que se te proporcionan.
Si una métrica no aparece en el contexto de datos, responde exactamente: "⚠️ Sin datos en el sistema para esta métrica."
NUNCA inventes cifras, porcentajes, fechas, nombres, tendencias o conclusiones no respaldadas por los datos.
NUNCA uses "probablemente", "se estima", "podría ser" sin citar la fuente exacta del dato.
NUNCA rellenes vacíos de información con conocimiento general — solo datos verificados del sistema.
════════════════════════════════════════════════════════

Cuando cites un dato SIEMPRE indica su fuente entre corchetes:
  [BP 2026 · Vantilisto], [Incidente #45 · Crítico], [Proyecto: Lanzamiento Q1], [Actividad: Campaña cliente]

Formato de respuesta ejecutiva:
- Lenguaje directo, preciso, sin rodeos
- Cifras en COP (millones o miles de millones según escala)
- Máximo 3-4 párrafos a menos que se solicite más detalle
- Cierra con "📌 Puntos que requieren su atención" cuando haya alertas en los datos
- Si no hay datos suficientes para responder, dilo claramente

Tu rol: Sintetizar la realidad del negocio CAS para la toma de decisiones ejecutivas,
basándote ÚNICAMENTE en los datos verificados del sistema SmartFlow.
"""


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class ARIAExecutiveRequest(BaseModel):
    question: str
    context_type: str = "general"  # general | financial | operations | risks


# ─── Context builder ──────────────────────────────────────────────────────────

async def _build_executive_context(db) -> dict:
    """
    Query ALL real data and return a structured dict + formatted text context for the AI.
    """
    now = datetime.utcnow()
    today = date.today()

    # ── Business Plans ─────────────────────────────────────────────────────────
    bp_result = await db.execute(
        select(BusinessPlan)
        .options(
            selectinload(BusinessPlan.business),
            selectinload(BusinessPlan.lines),
            selectinload(BusinessPlan.activities),
            selectinload(BusinessPlan.recommendations),
            selectinload(BusinessPlan.scenarios),
        )
        .where(BusinessPlan.is_deleted == False)
        .order_by(BusinessPlan.year.desc())
    )
    all_bps = bp_result.scalars().all()

    businesses_summary = []
    alerts = []

    for bp in all_bps:
        business_name = bp.business.name if bp.business else f"Negocio {bp.business_id}"
        business_color = bp.business.color if bp.business else "#6366f1"

        # Financial lines
        active_lines = [l for l in bp.lines if not l.is_deleted]
        ingresos = sum(
            (l.annual_plan or 0) for l in active_lines
            if l.category == BPLineCategory.INGRESO
        )
        costos = sum(
            (l.annual_plan or 0) for l in active_lines
            if l.category in (BPLineCategory.COSTO_FIJO, BPLineCategory.COSTO_VARIABLE)
        )
        margen = ingresos - costos
        margen_pct = round((margen / ingresos * 100), 2) if ingresos > 0 else 0.0

        # Activities
        acts = bp.activities
        total_acts = len(acts)
        completed_acts = sum(1 for a in acts if a.status == BPActivityStatus.COMPLETADA)
        in_progress_acts = sum(1 for a in acts if a.status == BPActivityStatus.EN_PROGRESO)
        overdue_acts = [
            a for a in acts
            if a.due_date and a.due_date < today
            and a.status not in (BPActivityStatus.COMPLETADA, BPActivityStatus.CANCELADA)
        ]
        pending_acts = sum(1 for a in acts if a.status == BPActivityStatus.PENDIENTE)
        completion_pct = round((completed_acts / total_acts * 100), 1) if total_acts > 0 else 0.0

        # Recommendations
        pending_recs = sum(1 for r in bp.recommendations if r.status == "pendiente")
        accepted_recs = sum(1 for r in bp.recommendations if r.status == "aceptada")

        # Scenarios
        scenario_best = None
        scenario_worst = None
        for sc in bp.scenarios:
            sc_type = sc.scenario_type if hasattr(sc.scenario_type, '__str__') else str(sc.scenario_type)
            if "optimista" in sc_type.lower() or "best" in sc_type.lower():
                scenario_best = sc
            elif "pesimista" in sc_type.lower() or "worst" in sc_type.lower():
                scenario_worst = sc

        bp_data = {
            "bp_id": bp.id,
            "business_name": business_name,
            "business_color": business_color,
            "business_id": bp.business_id,
            "year": bp.year,
            "status": bp.status.value if hasattr(bp.status, "value") else str(bp.status),
            "plan_ingresos": ingresos,
            "plan_costos": costos,
            "plan_margen": margen,
            "margen_pct": margen_pct,
            "has_financial_lines": len(active_lines) > 0,
            "lines_count": len(active_lines),
            "activities": {
                "total": total_acts,
                "completed": completed_acts,
                "in_progress": in_progress_acts,
                "overdue": len(overdue_acts),
                "pending": pending_acts,
                "completion_pct": completion_pct,
            },
            "recommendations": {
                "pending": pending_recs,
                "accepted": accepted_recs,
            },
            "scenarios": {
                "best_ingresos": scenario_best.computed_ingresos if scenario_best else None,
                "best_margen_pct": scenario_best.computed_margen_pct if scenario_best else None,
                "worst_ingresos": scenario_worst.computed_ingresos if scenario_worst else None,
                "worst_margen_pct": scenario_worst.computed_margen_pct if scenario_worst else None,
            },
            "overdue_activities": [
                {
                    "id": a.id,
                    "title": a.title,
                    "due_date": a.due_date.isoformat() if a.due_date else None,
                    "priority": a.priority.value if hasattr(a.priority, "value") else str(a.priority),
                    "owner_id": a.owner_id,
                }
                for a in overdue_acts
            ],
        }
        businesses_summary.append(bp_data)

        # Generate alerts for this BP
        if overdue_acts:
            for act in overdue_acts[:5]:
                priority_val = act.priority.value if hasattr(act.priority, "value") else str(act.priority)
                alerts.append({
                    "severity": "critico" if priority_val in ("critica", "alta") else "atencion",
                    "type": "bp_activity_overdue",
                    "message": f"Actividad vencida [{business_name} · BP {bp.year}]: {act.title}",
                    "detail": f"Venció: {act.due_date.isoformat() if act.due_date else 'N/D'} · Prioridad: {priority_val}",
                    "bp_id": bp.id,
                    "activity_id": act.id,
                    "link": f"/bp/{bp.id}",
                })

        if pending_recs > 0:
            alerts.append({
                "severity": "info",
                "type": "bp_recommendations_pending",
                "message": f"{pending_recs} recomendación(es) pendiente(s) [{business_name} · BP {bp.year}]",
                "bp_id": bp.id,
                "link": f"/bp/{bp.id}",
            })

        # Budget variance alert
        if ingresos > 0 and bp.total_ingresos_plan and bp.total_ingresos_plan > 0:
            variance_pct = abs((ingresos - bp.total_ingresos_plan) / bp.total_ingresos_plan * 100)
            if variance_pct > 20:
                alerts.append({
                    "severity": "atencion",
                    "type": "budget_variance",
                    "message": f"Variación presupuestal >20% [{business_name} · BP {bp.year}]",
                    "detail": f"Variación: {variance_pct:.1f}%",
                    "bp_id": bp.id,
                    "link": f"/bp/{bp.id}",
                })

    # ── Incidents ──────────────────────────────────────────────────────────────
    active_statuses = (IncidentStatus.OPEN, IncidentStatus.INVESTIGATING)
    inc_result = await db.execute(
        select(Incident)
        .options(selectinload(Incident.business))
        .where(
            Incident.is_deleted == False,
            Incident.status.in_(active_statuses),
        )
    )
    active_incidents = inc_result.scalars().all()

    inc_critical = [i for i in active_incidents if i.severity == IncidentSeverity.CRITICAL]
    inc_high = [i for i in active_incidents if i.severity == IncidentSeverity.HIGH]
    inc_medium = [i for i in active_incidents if i.severity == IncidentSeverity.MEDIUM]

    # Average resolution time for recently resolved (approximation from created_at)
    resolved_result = await db.execute(
        select(Incident).where(
            Incident.is_deleted == False,
            Incident.status == IncidentStatus.RESOLVED,
            Incident.resolution_date != None,
        ).limit(20)
    )
    resolved_incidents = resolved_result.scalars().all()
    if resolved_incidents:
        total_hours = 0
        count_with_data = 0
        for inc in resolved_incidents:
            if inc.resolution_date and inc.created_at:
                delta = inc.resolution_date - inc.created_at
                total_hours += delta.total_seconds() / 3600
                count_with_data += 1
        avg_resolution_hours = round(total_hours / count_with_data, 1) if count_with_data > 0 else None
    else:
        avg_resolution_hours = None

    incidents_summary = {
        "total_active": len(active_incidents),
        "critical": len(inc_critical),
        "high": len(inc_high),
        "medium": len(inc_medium),
        "avg_resolution_hours": avg_resolution_hours,
        "critical_list": [
            {
                "id": i.id,
                "incident_number": i.incident_number,
                "title": i.title,
                "status": i.status.value if hasattr(i.status, "value") else str(i.status),
                "created_at": i.created_at.isoformat() if i.created_at else None,
                "business": i.business.name if i.business else None,
                "hours_open": round((now - i.created_at.replace(tzinfo=None)).total_seconds() / 3600, 1)
                              if i.created_at else None,
            }
            for i in inc_critical
        ],
    }

    # Alerts for critical incidents
    for inc in inc_critical:
        hours_open = None
        if inc.created_at:
            hours_open = round((now - inc.created_at.replace(tzinfo=None)).total_seconds() / 3600, 1)
        alerts.append({
            "severity": "critico",
            "type": "incident_critical",
            "message": f"Incidente crítico abierto: {inc.title} ({inc.incident_number})",
            "detail": f"Abierto hace {hours_open:.0f}h" if hours_open else "Tiempo desconocido",
            "incident_id": inc.id,
            "link": f"/incidents/{inc.id}",
        })

    # ── Projects ───────────────────────────────────────────────────────────────
    proj_result = await db.execute(
        select(Project).where(
            Project.is_deleted == False,
            Project.status.in_([ProjectStatus.PLANNING, ProjectStatus.ACTIVE, ProjectStatus.PAUSED]),
        )
    )
    active_projects = proj_result.scalars().all()

    overdue_projects = [
        p for p in active_projects
        if p.due_date and p.due_date < today
        and p.status != ProjectStatus.CLOSED
    ]
    stalled_projects = [
        p for p in active_projects
        if p.updated_at and (now - p.updated_at.replace(tzinfo=None)).days > 14
        and p.status == ProjectStatus.ACTIVE
    ]

    projects_summary = {
        "total_active": len(active_projects),
        "by_status": {
            "planificacion": sum(1 for p in active_projects if p.status == ProjectStatus.PLANNING),
            "activo": sum(1 for p in active_projects if p.status == ProjectStatus.ACTIVE),
            "pausado": sum(1 for p in active_projects if p.status == ProjectStatus.PAUSED),
        },
        "overdue_count": len(overdue_projects),
        "stalled_count": len(stalled_projects),
        "overdue_list": [
            {
                "id": p.id,
                "name": p.name,
                "due_date": p.due_date.isoformat() if p.due_date else None,
                "progress": p.progress,
            }
            for p in overdue_projects
        ],
    }

    for proj in overdue_projects:
        alerts.append({
            "severity": "atencion",
            "type": "project_overdue",
            "message": f"Proyecto vencido: {proj.name}",
            "detail": f"Fecha límite: {proj.due_date.isoformat() if proj.due_date else 'N/D'} · Progreso: {proj.progress}%",
            "project_id": proj.id,
            "link": f"/projects/{proj.id}",
        })

    for proj in stalled_projects:
        days_stalled = (now - proj.updated_at.replace(tzinfo=None)).days if proj.updated_at else 0
        alerts.append({
            "severity": "info",
            "type": "project_stalled",
            "message": f"Proyecto sin actualización: {proj.name}",
            "detail": f"Sin cambios hace {days_stalled} días",
            "project_id": proj.id,
            "link": f"/projects/{proj.id}",
        })

    # ── Users ──────────────────────────────────────────────────────────────────
    users_result = await db.execute(
        select(User).where(User.is_active == True)
    )
    active_users = users_result.scalars().all()

    team_summary = {
        "total_active": len(active_users),
        "by_role": {},
        "by_team": {"BO": 0, "CAS": 0, "sin_equipo": 0},
    }
    for u in active_users:
        role_val = u.role.value if hasattr(u.role, "value") else str(u.role)
        team_summary["by_role"][role_val] = team_summary["by_role"].get(role_val, 0) + 1
        if u.team:
            team_val = u.team.value if hasattr(u.team, "value") else str(u.team)
            if team_val in team_summary["by_team"]:
                team_summary["by_team"][team_val] += 1
        else:
            team_summary["by_team"]["sin_equipo"] += 1

    # ── Global KPIs ────────────────────────────────────────────────────────────
    total_overdue_activities = sum(b["activities"]["overdue"] for b in businesses_summary)
    overall_completion = (
        round(
            sum(b["activities"]["completion_pct"] for b in businesses_summary) / len(businesses_summary),
            1,
        )
        if businesses_summary else 0.0
    )

    structured_data = {
        "generated_at": now.isoformat(),
        "businesses": businesses_summary,
        "incidents": incidents_summary,
        "projects": projects_summary,
        "team": team_summary,
        "alerts": alerts,
        "kpis": {
            "total_bps": len(all_bps),
            "overall_completion_pct": overall_completion,
            "total_overdue_activities": total_overdue_activities,
            "critical_incidents": incidents_summary["critical"],
            "active_projects": projects_summary["total_active"],
        },
    }

    # ── Build context_text for AI ──────────────────────────────────────────────
    context_lines = [
        f"=== RESUMEN EJECUTIVO SmartFlow — {now.strftime('%Y-%m-%d %H:%M UTC')} ===",
        "",
        "PLANES DE NEGOCIO:",
    ]
    for b in businesses_summary:
        financial_str = (
            f"Ingresos plan: ${b['plan_ingresos'] / 1_000_000:.1f}M COP | "
            f"Costos plan: ${b['plan_costos'] / 1_000_000:.1f}M COP | "
            f"Margen: {b['margen_pct']}%"
            if b["has_financial_lines"] else "Sin líneas financieras registradas"
        )
        acts = b["activities"]
        context_lines.append(
            f"• {b['business_name']}: BP {b['year']} [{b['status'].upper()}] — "
            f"{financial_str} | "
            f"Actividades: {acts['total']} total, {acts['completed']} completadas "
            f"({acts['completion_pct']}%), {acts['overdue']} vencidas"
        )
        if b["scenarios"]["best_ingresos"]:
            context_lines.append(
                f"  Escenario optimista: Ingresos ${b['scenarios']['best_ingresos'] / 1_000_000:.1f}M | "
                f"Margen {b['scenarios']['best_margen_pct']}%"
            )
        if b["scenarios"]["worst_ingresos"]:
            context_lines.append(
                f"  Escenario pesimista: Ingresos ${b['scenarios']['worst_ingresos'] / 1_000_000:.1f}M | "
                f"Margen {b['scenarios']['worst_margen_pct']}%"
            )

    context_lines += [
        "",
        "INCIDENTES ACTIVOS:",
        f"• Críticos: {incidents_summary['critical']} (abiertos sin resolución)",
        f"• Altos: {incidents_summary['high']}",
        f"• Medios: {incidents_summary['medium']}",
    ]
    if avg_resolution_hours is not None:
        context_lines.append(f"• Tiempo promedio de resolución: {avg_resolution_hours}h")
    for inc in inc_critical:
        hours_open = round((now - inc.created_at.replace(tzinfo=None)).total_seconds() / 3600, 1) if inc.created_at else "N/D"
        context_lines.append(
            f"  [Incidente #{inc.id} · Crítico] {inc.title} ({inc.incident_number}) — Abierto hace {hours_open}h"
        )

    context_lines += [
        "",
        "PROYECTOS:",
        f"• Activos: {projects_summary['total_active']} proyectos",
        f"• Vencidos (sin completar): {projects_summary['overdue_count']}",
        f"• Sin actualización >14 días: {projects_summary['stalled_count']}",
        f"• Por estado — Planificación: {projects_summary['by_status']['planificacion']}, "
        f"Activo: {projects_summary['by_status']['activo']}, "
        f"Pausado: {projects_summary['by_status']['pausado']}",
    ]

    context_lines += [
        "",
        "EQUIPO:",
        f"• Usuarios activos: {team_summary['total_active']}",
        f"• Por equipo — BO: {team_summary['by_team']['BO']}, "
        f"CAS: {team_summary['by_team']['CAS']}, "
        f"Sin equipo: {team_summary['by_team']['sin_equipo']}",
    ]

    context_lines += ["", "ALERTAS DEL SISTEMA:"]
    if alerts:
        for alert in alerts[:20]:  # limit to avoid token overflow
            severity_icon = "🔴" if alert["severity"] == "critico" else ("⚠" if alert["severity"] == "atencion" else "🔵")
            context_lines.append(f"• {severity_icon} {alert['message']}")
    else:
        context_lines.append("• Sin alertas activas")

    context_text = "\n".join(context_lines)

    return {
        "data": structured_data,
        "context_text": context_text,
        "alerts": alerts,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/summary")
async def executive_summary(
    db: DB,
    current_user: DirectivoOrAdmin,
):
    """Returns the full executive data summary (KPIs, businesses, incidents, projects, team)."""
    ctx = await _build_executive_context(db)
    return ctx["data"]


@router.post("/aria")
async def executive_aria(
    body: ARIAExecutiveRequest,
    db: DB,
    current_user: DirectivoOrAdmin,
):
    """Ask ARIA Directiva a question grounded exclusively in verified system data."""
    ctx = await _build_executive_context(db)
    data = ctx["data"]
    context_text = ctx["context_text"]
    alerts = ctx["alerts"]

    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="La pregunta no puede estar vacía")

    # Build sources list from data
    sources_used = []
    for b in data["businesses"]:
        sources_used.append(f"BP {b['year']} · {b['business_name']}")
    if data["incidents"]["critical"] > 0:
        sources_used.append(f"Incidentes críticos: {data['incidents']['critical']}")
    if data["projects"]["total_active"] > 0:
        sources_used.append(f"Proyectos activos: {data['projects']['total_active']}")

    # Attempt Gemini call
    try:
        from app.core.config import get_service_config_value

        api_key = await get_service_config_value(db, "gemini", "api_key")
        model_name = await get_service_config_value(db, "gemini", "model") or "gemini-1.5-pro"

        if api_key:
            full_prompt = (
                ARIA_EXECUTIVE_PROMPT
                + "\n\nDATA DEL SISTEMA (estos son los únicos datos verificados disponibles):\n"
                + context_text
                + "\n\nPREGUNTA DIRECTIVA: "
                + question
            )

            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}",
                    json={
                        "contents": [{"parts": [{"text": full_prompt}]}],
                        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
                    },
                )
                if resp.status_code == 200:
                    gemini_data = resp.json()
                    ai_text = gemini_data["candidates"][0]["content"]["parts"][0]["text"]
                    return {
                        "response": ai_text,
                        "data_snapshot": data,
                        "is_ai": True,
                        "sources_used": sources_used,
                    }
    except Exception:
        pass

    # Fallback: structured data-only response (no AI hallucination)
    lines = ["**Reporte de datos verificados — SmartFlow**", ""]
    lines.append("**Planes de Negocio activos:**")
    for b in data["businesses"]:
        fin = (
            f"Ingresos plan: ${b['plan_ingresos'] / 1_000_000:.1f}M COP · "
            f"Margen: {b['margen_pct']}%"
            if b["has_financial_lines"]
            else "Sin líneas financieras registradas"
        )
        acts = b["activities"]
        lines.append(
            f"- **{b['business_name']}** (BP {b['year']} · {b['status'].upper()}): "
            f"{fin} · Actividades: {acts['completed']}/{acts['total']} completadas "
            f"({acts['completion_pct']}%), {acts['overdue']} vencidas"
        )

    lines += [
        "",
        f"**Incidentes activos:** {data['incidents']['total_active']} "
        f"(Críticos: {data['incidents']['critical']}, Altos: {data['incidents']['high']})",
        f"**Proyectos activos:** {data['projects']['total_active']} "
        f"(Vencidos: {data['projects']['overdue_count']})",
        f"**Equipo:** {data['team']['total_active']} usuarios activos",
    ]

    if alerts:
        lines += ["", "📌 **Puntos que requieren su atención:**"]
        for alert in alerts[:8]:
            icon = "🔴" if alert["severity"] == "critico" else ("⚠️" if alert["severity"] == "atencion" else "🔵")
            lines.append(f"{icon} {alert['message']}")

    fallback_text = "\n".join(lines)

    return {
        "response": fallback_text,
        "data_snapshot": data,
        "is_ai": False,
        "sources_used": sources_used,
    }


@router.get("/alerts")
async def executive_alerts(
    db: DB,
    current_user: DirectivoOrAdmin,
):
    """Returns all active alerts — fast endpoint, no AI call."""
    ctx = await _build_executive_context(db)
    return {
        "alerts": ctx["alerts"],
        "total": len(ctx["alerts"]),
        "critical_count": sum(1 for a in ctx["alerts"] if a["severity"] == "critico"),
        "attention_count": sum(1 for a in ctx["alerts"] if a["severity"] == "atencion"),
        "info_count": sum(1 for a in ctx["alerts"] if a["severity"] == "info"),
    }


@router.get("/businesses")
async def executive_businesses(
    db: DB,
    current_user: DirectivoOrAdmin,
):
    """Returns per-business executive summary."""
    ctx = await _build_executive_context(db)
    data = ctx["data"]

    # Enrich with active incident count per business_id
    inc_result = await db.execute(
        select(Incident).where(
            Incident.is_deleted == False,
            Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.INVESTIGATING]),
        )
    )
    active_incidents = inc_result.scalars().all()
    inc_by_business: dict[int, int] = {}
    for inc in active_incidents:
        if inc.business_id:
            inc_by_business[inc.business_id] = inc_by_business.get(inc.business_id, 0) + 1

    businesses = []
    for b in data["businesses"]:
        businesses.append({
            **b,
            "incident_count_open": inc_by_business.get(b["business_id"], 0),
        })

    return {
        "businesses": businesses,
        "generated_at": data["generated_at"],
    }
