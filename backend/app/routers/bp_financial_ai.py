"""
ARIA Financial Intelligence router — CAS team
Endpoints for AI-powered financial analysis, scenarios, sensitivity, and chat.
"""
from typing import Optional
import json
import re

from fastapi import APIRouter, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DB, CurrentUser, LeaderOrAdmin
from app.models.business_plan import BusinessPlan, BPLine, BPActivity, BPLineCategory
from app.models.bp_financial_ai import BPAssumptions, BPScenario, BPAuditLog
from app.models.business import Business
from app.models.business_intel import PremisaNegocio
from app.schemas.bp_financial_ai import (
    BPAssumptionsCreate,
    BPAssumptionsUpdate,
    ARIAChatMessage,
    BPSensitivityRequest,
    BPScenarioGenerateRequest,
)

router = APIRouter(tags=["ARIA Financial Intelligence"])

# ─── ARIA System Prompt ───────────────────────────────────────────────────────

ARIA_SYSTEM_PROMPT = """Eres ARIA (Analista de Rentabilidad e Inteligencia Accionable) — una analista financiera de nivel doctoral especializada en planeación presupuestal y control de gestión para empresas de servicios públicos en América Latina.

Formación y expertise:
- PhD en Economía Financiera, MIT Sloan School of Management
- MBA Finance con distinción, Harvard Business School
- CFA Level III (Chartered Financial Analyst)
- 20 años modelando financieramente empresas de gas, energía y telecomunicaciones en Colombia
- Experta en modelo tarifario CREG, regulación de distribución de gas natural

Conocimiento profundo de Vanti / CAS:
- Vantilisto: servicio de revisión y mantenimiento de instalaciones de gas
- N.Edificación: proyectos de infraestructura en edificaciones nuevas
- Saturación: estrategias para mercados de alta penetración
- Vanti Max: segmento premium de clientes
- Marketing: generación de demanda y marca
- Ciclo de Ingreso: optimización del proceso de facturación y recaudo

Principios que aplicas siempre:
1. CAUSALIDAD FINANCIERA: Explicas las cadenas causales completas.
   Ejemplos: Clientes↓ → Volumen↓ → Ingresos↓ → Margen bruto↓ → EBITDA↓ → Cobertura deuda en riesgo
   Churn↑ → ARPU efectivo↓ → Costo de adquisición relativo↑ → LTV/CAC deteriorado
   Inflación (IPC)↑ → Costos fijos↑ → Margen operacional comprimido si tarifas reguladas no ajustan
2. ESCENARIOS (siempre tres): Optimista (P90), Base (P50), Pesimista (P10) con probabilidades y drivers específicos
3. SENSIBILIDAD: Para cada variable crítica: impacto en ingresos (%), impacto en EBITDA (COP y %), punto de equilibrio
4. SUPUESTOS EXPLÍCITOS: Cada proyección lleva su supuesto, base técnica y fuente de referencia
5. ALERTAS PROACTIVAS: Identificas compresión de márgenes, concentración de clientes, ciclos de caja negativos ANTES de que ocurran
6. RIGOR: Usas DCF, análisis de varianza, regresión de tendencias, benchmarks del sector
7. ACCIONABILIDAD: Cada análisis cierra con acciones prioritarias por impacto/esfuerzo/plazo

Formato de respuesta: Estructurado con secciones claras, cifras concretas en COP, tablas cuando aplica, y siempre una sección "Puntos Críticos de Atención" al final."""


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _assumptions_to_dict(a: BPAssumptions) -> dict:
    return {
        "id": a.id,
        "business_id": a.business_id,
        "business_name": a.business.name if a.business else None,
        "year": a.year,
        "ipc_pct": a.ipc_pct,
        "gdp_growth_pct": a.gdp_growth_pct,
        "trm_avg": a.trm_avg,
        "banrep_rate_pct": a.banrep_rate_pct,
        "market_growth_pct": a.market_growth_pct,
        "client_growth_pct": a.client_growth_pct,
        "churn_rate_pct": a.churn_rate_pct,
        "arpu_monthly": a.arpu_monthly,
        "tariff_adjustment_pct": a.tariff_adjustment_pct,
        "salary_increase_pct": a.salary_increase_pct,
        "energy_cost_change_pct": a.energy_cost_change_pct,
        "custom_assumptions": a.custom_assumptions,
        "client_volume_current": a.client_volume_current,
        "client_volume_projected": a.client_volume_projected,
        "client_volume_actual": a.client_volume_actual,
        "notes": a.notes,
        "source": a.source,
        "created_at": a.created_at,
        "updated_at": a.updated_at,
    }


def _scenario_to_dict(s: BPScenario) -> dict:
    return {
        "id": s.id,
        "bp_id": s.bp_id,
        "name": s.name,
        "scenario_type": s.scenario_type,
        "probability_pct": s.probability_pct,
        "description": s.description,
        "line_adjustments": s.line_adjustments,
        "computed_ingresos": s.computed_ingresos,
        "computed_costos": s.computed_costos,
        "computed_margen_pct": s.computed_margen_pct,
        "computed_ebitda": s.computed_ebitda,
        "key_assumptions": s.key_assumptions,
        "ai_narrative": s.ai_narrative,
        "sensitivity_table": s.sensitivity_table,
        "source": s.source,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


def _audit_to_dict(a: BPAuditLog) -> dict:
    return {
        "id": a.id,
        "bp_id": a.bp_id,
        "audit_type": a.audit_type,
        "request_context": a.request_context,
        "ai_response": a.ai_response,
        "structured_output": a.structured_output,
        "snapshot_metrics": a.snapshot_metrics,
        "requested_by_id": a.requested_by_id,
        "requested_by_name": a.requested_by.full_name if a.requested_by else None,
        "created_at": a.created_at,
    }


def _compute_bp_summary(lines: list) -> dict:
    """Compute ingresos, costos, margen from BPLine list."""
    ingresos = sum(
        (l.annual_plan or 0) for l in lines
        if not l.is_deleted and l.category == BPLineCategory.INGRESO
    )
    costos_fijos = sum(
        (l.annual_plan or 0) for l in lines
        if not l.is_deleted and l.category == BPLineCategory.COSTO_FIJO
    )
    costos_variables = sum(
        (l.annual_plan or 0) for l in lines
        if not l.is_deleted and l.category == BPLineCategory.COSTO_VARIABLE
    )
    costos_total = costos_fijos + costos_variables
    margen = ingresos - costos_total
    margen_pct = (margen / ingresos * 100) if ingresos > 0 else 0
    return {
        "ingresos": ingresos,
        "costos_fijos": costos_fijos,
        "costos_variables": costos_variables,
        "costos_total": costos_total,
        "margen": margen,
        "margen_pct": round(margen_pct, 2),
    }


def _lines_context(lines: list) -> str:
    """Format BP lines as readable context for ARIA."""
    if not lines:
        return "Sin líneas financieras definidas."
    parts = []
    for l in lines:
        if l.is_deleted:
            continue
        cat = l.category.value if hasattr(l.category, "value") else l.category
        annual = l.annual_plan
        annual_str = f"${annual:,.0f} COP" if annual is not None else "N/D"
        parts.append(f"  - [{cat.upper()}] {l.name}: {annual_str} anual")
    return "\n".join(parts) if parts else "Sin líneas activas."


async def _call_aria(
    db: AsyncSession,
    prompt_user: str,
    bp_id: int,
    audit_type: str,
    requested_by_id: Optional[int],
    additional_context: Optional[str] = None,
) -> tuple[str, int]:
    """
    Call ARIA (Gemini) with the system prompt + user prompt.
    Returns (response_text, audit_log_id).
    """
    from app.core.config import get_service_config_value
    import httpx

    api_key = await get_service_config_value(db, "gemini", "api_key")
    model_name = await get_service_config_value(db, "gemini", "model") or "gemini-1.5-pro"

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ARIA no está disponible. Configura Gemini en Configuración > Integraciones para activar ARIA.",
        )

    full_prompt = f"{ARIA_SYSTEM_PROMPT}\n\n"
    if additional_context:
        full_prompt += f"CONTEXTO DEL BP:\n{additional_context}\n\n"
    full_prompt += f"CONSULTA:\n{prompt_user}"

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}",
                json={
                    "contents": [{"parts": [{"text": full_prompt}]}],
                    "generationConfig": {"temperature": 0.3, "maxOutputTokens": 4096},
                },
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Error al contactar ARIA (Gemini {resp.status_code}): {resp.text[:300]}",
                )
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al contactar ARIA: {str(e)}")

    # Save audit log
    log = BPAuditLog(
        bp_id=bp_id,
        audit_type=audit_type,
        request_context={"prompt": prompt_user[:500]},
        ai_response=text,
        requested_by_id=requested_by_id,
    )
    db.add(log)
    await db.flush()
    log_id = log.id

    return text, log_id


async def _get_bp_or_404(db: AsyncSession, bp_id: int) -> BusinessPlan:
    result = await db.execute(
        select(BusinessPlan)
        .options(
            selectinload(BusinessPlan.lines),
            selectinload(BusinessPlan.activities),
            selectinload(BusinessPlan.business),
        )
        .where(BusinessPlan.id == bp_id, BusinessPlan.is_deleted == False)
    )
    bp = result.scalar_one_or_none()
    if not bp:
        raise HTTPException(status_code=404, detail="Business Plan no encontrado")
    return bp


def _build_bp_context(bp: BusinessPlan, assumptions: Optional[BPAssumptions] = None) -> str:
    """Build a rich context string for ARIA from a BP."""
    lines = [l for l in bp.lines if not l.is_deleted]
    summary = _compute_bp_summary(lines)
    business_name = bp.business.name if bp.business else f"Business {bp.business_id}"

    ctx = f"""BUSINESS PLAN — {business_name} — AÑO {bp.year}
Estado: {bp.status.value if hasattr(bp.status, 'value') else bp.status}
Versión: {bp.version}

RESUMEN FINANCIERO:
  Ingresos totales plan: ${summary['ingresos']:,.0f} COP
  Costos fijos plan:     ${summary['costos_fijos']:,.0f} COP
  Costos variables plan: ${summary['costos_variables']:,.0f} COP
  Costos totales:        ${summary['costos_total']:,.0f} COP
  Margen bruto:          ${summary['margen']:,.0f} COP ({summary['margen_pct']:.1f}%)

LÍNEAS FINANCIERAS DETALLADAS:
{_lines_context(lines)}
"""

    if assumptions:
        ctx += f"""
SUPUESTOS MACROECONÓMICOS Y DE NEGOCIO ({assumptions.year}):
  IPC Colombia: {assumptions.ipc_pct or 'N/D'}%
  Crecimiento PIB: {assumptions.gdp_growth_pct or 'N/D'}%
  TRM promedio: ${assumptions.trm_avg or 'N/D'} COP/USD
  Tasa Banrep: {assumptions.banrep_rate_pct or 'N/D'}%
  Crecimiento mercado: {assumptions.market_growth_pct or 'N/D'}%
  Crecimiento clientes: {assumptions.client_growth_pct or 'N/D'}%
  Tasa churn: {assumptions.churn_rate_pct or 'N/D'}%
  ARPU mensual: ${assumptions.arpu_monthly or 'N/D'} COP
  Ajuste tarifario: {assumptions.tariff_adjustment_pct or 'N/D'}%
  Incremento salarial: {assumptions.salary_increase_pct or 'N/D'}%
  Variación costo energía: {assumptions.energy_cost_change_pct or 'N/D'}%
"""
        if assumptions.notes:
            ctx += f"  Notas: {assumptions.notes}\n"

    activities = [a for a in bp.activities if not a.is_deleted]
    if activities:
        ctx += f"\nACTIVIDADES ({len(activities)} total):\n"
        for act in activities[:10]:
            status = act.status.value if hasattr(act.status, "value") else act.status
            ctx += f"  - [{status.upper()}] {act.title} (prioridad: {act.priority.value if hasattr(act.priority, 'value') else act.priority})\n"
        if len(activities) > 10:
            ctx += f"  ... y {len(activities) - 10} actividades más\n"

    return ctx


# ─── Endpoint 1: GET assumptions ─────────────────────────────────────────────

@router.get("/bp-ai/assumptions")
async def get_assumptions(
    business_id: int,
    year: int,
    db: DB,
    current_user: CurrentUser,
):
    result = await db.execute(
        select(BPAssumptions)
        .options(selectinload(BPAssumptions.business))
        .where(
            BPAssumptions.business_id == business_id,
            BPAssumptions.year == year,
            BPAssumptions.is_deleted == False,
        )
    )
    assumption = result.scalar_one_or_none()
    if not assumption:
        return None
    return _assumptions_to_dict(assumption)


# ─── Endpoint 2: PUT assumptions (upsert) ────────────────────────────────────

@router.put("/bp-ai/assumptions")
async def upsert_assumptions(
    body: BPAssumptionsCreate,
    db: DB,
    current_user: LeaderOrAdmin,
):
    result = await db.execute(
        select(BPAssumptions)
        .options(selectinload(BPAssumptions.business))
        .where(
            BPAssumptions.business_id == body.business_id,
            BPAssumptions.year == body.year,
            BPAssumptions.is_deleted == False,
        )
    )
    assumption = result.scalar_one_or_none()

    if assumption:
        # Update
        for field in [
            "ipc_pct", "gdp_growth_pct", "trm_avg", "banrep_rate_pct",
            "market_growth_pct", "client_growth_pct", "churn_rate_pct", "arpu_monthly",
            "tariff_adjustment_pct", "salary_increase_pct", "energy_cost_change_pct",
            "custom_assumptions", "notes",
        ]:
            val = getattr(body, field, None)
            if val is not None:
                setattr(assumption, field, val)
        assumption.source = "manual"
    else:
        # Create
        assumption = BPAssumptions(
            business_id=body.business_id,
            year=body.year,
            ipc_pct=body.ipc_pct,
            gdp_growth_pct=body.gdp_growth_pct,
            trm_avg=body.trm_avg,
            banrep_rate_pct=body.banrep_rate_pct,
            market_growth_pct=body.market_growth_pct,
            client_growth_pct=body.client_growth_pct,
            churn_rate_pct=body.churn_rate_pct,
            arpu_monthly=body.arpu_monthly,
            tariff_adjustment_pct=body.tariff_adjustment_pct,
            salary_increase_pct=body.salary_increase_pct,
            energy_cost_change_pct=body.energy_cost_change_pct,
            custom_assumptions=body.custom_assumptions,
            notes=body.notes,
            source="manual",
            created_by_id=current_user.id,
        )
        db.add(assumption)

    await db.commit()
    await db.refresh(assumption)

    # Reload with relationship
    result = await db.execute(
        select(BPAssumptions)
        .options(selectinload(BPAssumptions.business))
        .where(BPAssumptions.id == assumption.id)
    )
    assumption = result.scalar_one()
    return _assumptions_to_dict(assumption)


# ─── Endpoint 3: POST assumptions/generate ───────────────────────────────────

@router.post("/bp-ai/assumptions/generate")
async def generate_assumptions(
    body: dict,
    db: DB,
    current_user: CurrentUser,
):
    business_id = body.get("business_id")
    year = body.get("year")
    business_name = body.get("business_name", "negocio")

    if not business_id or not year:
        raise HTTPException(status_code=400, detail="business_id y year son requeridos")

    prompt = f"""Genera supuestos macroeconómicos y de negocio REALISTAS para una empresa colombiana de gas natural (Vanti),
negocio: {business_name}, año: {year}.

Considera el contexto colombiano actual: inflación reciente, tasas Banrep, crecimiento PIB, tendencias del sector gas.

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{{
  "ipc_pct": <float, inflación esperada %>,
  "gdp_growth_pct": <float, crecimiento PIB Colombia %>,
  "trm_avg": <float, TRM promedio COP/USD>,
  "banrep_rate_pct": <float, tasa Banrep %>,
  "market_growth_pct": <float, crecimiento mercado gas %>,
  "client_growth_pct": <float, crecimiento clientes esperado %>,
  "churn_rate_pct": <float, tasa churn anual %>,
  "arpu_monthly": <float, ARPU mensual COP estimado>,
  "tariff_adjustment_pct": <float, ajuste tarifario esperado %>,
  "salary_increase_pct": <float, incremento salarial %>,
  "energy_cost_change_pct": <float, variación costo gas/energía %>,
  "notes": "<string, justificación técnica de los supuestos con fuentes>"
}}

Sé específico con cifras. Basa los valores en tendencias reales del mercado colombiano."""

    from app.core.config import get_service_config_value
    import httpx

    api_key = await get_service_config_value(db, "gemini", "api_key")
    model_name = await get_service_config_value(db, "gemini", "model") or "gemini-1.5-pro"

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ARIA no está disponible. Configura Gemini en Configuración > Integraciones.",
        )

    full_prompt = f"{ARIA_SYSTEM_PROMPT}\n\n{prompt}"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}",
                json={
                    "contents": [{"parts": [{"text": full_prompt}]}],
                    "generationConfig": {
                        "temperature": 0.2,
                        "maxOutputTokens": 2048,
                        "responseMimeType": "application/json",
                    },
                },
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Error Gemini {resp.status_code}")
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            # Try to parse JSON
            try:
                suggestion = json.loads(text)
            except Exception:
                # Try to extract JSON from markdown
                match = re.search(r"\{.*\}", text, re.DOTALL)
                if match:
                    suggestion = json.loads(match.group())
                else:
                    raise HTTPException(status_code=502, detail="ARIA no devolvió JSON válido")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al contactar ARIA: {str(e)}")

    return {
        "suggested": True,
        "business_id": business_id,
        "year": year,
        "source": "ai",
        **{k: suggestion.get(k) for k in [
            "ipc_pct", "gdp_growth_pct", "trm_avg", "banrep_rate_pct",
            "market_growth_pct", "client_growth_pct", "churn_rate_pct", "arpu_monthly",
            "tariff_adjustment_pct", "salary_increase_pct", "energy_cost_change_pct", "notes",
        ]},
    }


# ─── Endpoint 4: POST /bp/{bp_id}/aria/audit ─────────────────────────────────

@router.post("/bp/{bp_id}/aria/audit")
async def run_audit(
    bp_id: int,
    db: DB,
    current_user: CurrentUser,
):
    bp = await _get_bp_or_404(db, bp_id)

    # Load assumptions if available
    business_name = bp.business.name if bp.business else f"Business {bp.business_id}"
    result = await db.execute(
        select(BPAssumptions).where(
            BPAssumptions.business_id == bp.business_id,
            BPAssumptions.year == bp.year,
            BPAssumptions.is_deleted == False,
        )
    )
    assumptions = result.scalar_one_or_none()

    context = _build_bp_context(bp, assumptions)
    lines = [l for l in bp.lines if not l.is_deleted]
    summary = _compute_bp_summary(lines)

    audit_prompt = f"""Realiza una auditoría presupuestal completa y rigurosa de este Business Plan.

Estructura tu respuesta con las siguientes secciones claramente delimitadas:

## 1. RESUMEN EJECUTIVO
Síntesis de la situación financiera en 3-4 oraciones con cifras concretas en COP.

## 2. ANÁLISIS DE VARIANZAS
Identifica las líneas más significativas. Compara con benchmarks del sector gas/servicios públicos Colombia.

## 3. RIESGOS IDENTIFICADOS
Lista los top 5 riesgos con probabilidad e impacto cuantificado en COP.

## 4. OPORTUNIDADES
Lista las top 3 oportunidades con potencial de impacto cuantificado.

## 5. RECOMENDACIONES PRIORITARIAS
Acciones concretas ordenadas por impacto/esfuerzo/plazo (inmediato/30d/90d/6m).

## 6. PUNTOS CRÍTICOS DE ATENCIÓN
Alertas que requieren acción inmediata. Sin cifras especulativas — solo hechos del BP."""

    text, log_id = await _call_aria(
        db=db,
        prompt_user=audit_prompt,
        bp_id=bp_id,
        audit_type="full_audit",
        requested_by_id=current_user.id,
        additional_context=context,
    )

    # Parse sections
    sections = {}
    section_patterns = {
        "executive_summary": r"## 1\. RESUMEN EJECUTIVO\n(.*?)(?=## 2\.|\Z)",
        "variances": r"## 2\. ANÁLISIS DE VARIANZAS\n(.*?)(?=## 3\.|\Z)",
        "risks": r"## 3\. RIESGOS IDENTIFICADOS\n(.*?)(?=## 4\.|\Z)",
        "opportunities": r"## 4\. OPORTUNIDADES\n(.*?)(?=## 5\.|\Z)",
        "recommendations_list": r"## 5\. RECOMENDACIONES PRIORITARIAS\n(.*?)(?=## 6\.|\Z)",
        "action_items": r"## 6\. PUNTOS CRÍTICOS DE ATENCIÓN\n(.*?)(?=\Z)",
    }
    for key, pattern in section_patterns.items():
        m = re.search(pattern, text, re.DOTALL)
        sections[key] = m.group(1).strip() if m else ""

    # Update audit log with structured output and snapshot
    result2 = await db.execute(select(BPAuditLog).where(BPAuditLog.id == log_id))
    log = result2.scalar_one_or_none()
    if log:
        log.structured_output = sections
        log.snapshot_metrics = summary

    await db.commit()

    return {
        "audit_log_id": log_id,
        "ai_response": text,
        "sections": sections,
        "snapshot_metrics": summary,
    }


# ─── Endpoint 5: POST /bp/{bp_id}/aria/scenarios ─────────────────────────────

@router.post("/bp/{bp_id}/aria/scenarios")
async def generate_scenarios(
    bp_id: int,
    body: BPScenarioGenerateRequest,
    db: DB,
    current_user: LeaderOrAdmin,
):
    bp = await _get_bp_or_404(db, bp_id)

    assumptions = None
    if body.use_assumptions_id:
        result = await db.execute(
            select(BPAssumptions).where(BPAssumptions.id == body.use_assumptions_id)
        )
        assumptions = result.scalar_one_or_none()
    else:
        result = await db.execute(
            select(BPAssumptions).where(
                BPAssumptions.business_id == bp.business_id,
                BPAssumptions.year == bp.year,
                BPAssumptions.is_deleted == False,
            )
        )
        assumptions = result.scalar_one_or_none()

    context = _build_bp_context(bp, assumptions)
    lines = [l for l in bp.lines if not l.is_deleted]
    summary = _compute_bp_summary(lines)

    custom_ctx = f"\nContexto adicional: {body.custom_context}" if body.custom_context else ""

    scenario_prompt = f"""Genera TRES escenarios financieros para este Business Plan: Optimista (P90), Base (P50) y Pesimista (P10).
{custom_ctx}

Para cada escenario, calcula los ajustes sobre los ingresos base (${summary['ingresos']:,.0f} COP) y costos base (${summary['costos_total']:,.0f} COP).

Responde ÚNICAMENTE con JSON válido con esta estructura:
{{
  "scenarios": [
    {{
      "name": "Optimista",
      "scenario_type": "optimista",
      "probability_pct": 15,
      "description": "<descripción del escenario>",
      "revenue_multiplier": <float, ej 1.15 para +15%>,
      "cost_multiplier": <float, ej 1.05>,
      "computed_ingresos": <float COP>,
      "computed_costos": <float COP>,
      "computed_margen_pct": <float %>,
      "computed_ebitda": <float COP, margen - costos_estructurales_est>,
      "key_assumptions": {{
        "driver_1": "<descripción>",
        "driver_2": "<descripción>",
        "driver_3": "<descripción>"
      }},
      "ai_narrative": "<narrativa detallada de 4-6 oraciones explicando los drivers causales y condiciones necesarias>",
      "sensitivity_table": {{
        "client_growth_pct": {{"-20%": <ingresos>, "-10%": <ingresos>, "0%": <ingresos>, "+10%": <ingresos>, "+20%": <ingresos>}},
        "ipc_pct": {{"-20%": <costos>, "-10%": <costos>, "0%": <costos>, "+10%": <costos>, "+20%": <costos>}}
      }}
    }},
    {{
      "name": "Base",
      "scenario_type": "base",
      "probability_pct": 60,
      ...
    }},
    {{
      "name": "Pesimista",
      "scenario_type": "pesimista",
      "probability_pct": 25,
      ...
    }}
  ]
}}"""

    text, log_id = await _call_aria(
        db=db,
        prompt_user=scenario_prompt,
        bp_id=bp_id,
        audit_type="scenarios",
        requested_by_id=current_user.id,
        additional_context=context,
    )

    # Parse JSON response
    try:
        data = json.loads(text)
    except Exception:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group())
            except Exception:
                data = {"scenarios": []}
        else:
            data = {"scenarios": []}

    scenarios_data = data.get("scenarios", [])

    # Delete existing scenarios for this BP
    await db.execute(
        delete(BPScenario).where(BPScenario.bp_id == bp_id)
    )

    # Create new scenarios
    created = []
    for s in scenarios_data:
        scenario = BPScenario(
            bp_id=bp_id,
            name=s.get("name", "Escenario"),
            scenario_type=s.get("scenario_type", "base"),
            probability_pct=s.get("probability_pct"),
            description=s.get("description"),
            line_adjustments={
                "revenue_multiplier": s.get("revenue_multiplier", 1.0),
                "cost_multiplier": s.get("cost_multiplier", 1.0),
            },
            computed_ingresos=s.get("computed_ingresos"),
            computed_costos=s.get("computed_costos"),
            computed_margen_pct=s.get("computed_margen_pct"),
            computed_ebitda=s.get("computed_ebitda"),
            key_assumptions=s.get("key_assumptions"),
            ai_narrative=s.get("ai_narrative"),
            sensitivity_table=s.get("sensitivity_table"),
            source="ai",
        )
        db.add(scenario)
        created.append(scenario)

    await db.commit()
    for s in created:
        await db.refresh(s)

    return {
        "scenarios": [_scenario_to_dict(s) for s in created],
        "audit_log_id": log_id,
    }


# ─── Endpoint 6: POST /bp/{bp_id}/aria/sensitivity ───────────────────────────

@router.post("/bp/{bp_id}/aria/sensitivity")
async def sensitivity_analysis(
    bp_id: int,
    body: BPSensitivityRequest,
    db: DB,
    current_user: CurrentUser,
):
    bp = await _get_bp_or_404(db, bp_id)

    result = await db.execute(
        select(BPAssumptions).where(
            BPAssumptions.business_id == bp.business_id,
            BPAssumptions.year == bp.year,
            BPAssumptions.is_deleted == False,
        )
    )
    assumptions = result.scalar_one_or_none()

    lines = [l for l in bp.lines if not l.is_deleted]
    summary = _compute_bp_summary(lines)

    ranges = body.ranges or [-20.0, -10.0, 0.0, 10.0, 20.0]
    range_keys = [f"{'+' if r > 0 else ''}{int(r)}%" for r in ranges]

    base_ingresos = summary["ingresos"]
    base_costos = summary["costos_total"]
    base_margen = summary["margen"]

    arpu = assumptions.arpu_monthly if assumptions else 0
    churn = (assumptions.churn_rate_pct or 0) / 100 if assumptions else 0

    # Numeric sensitivity computation per variable
    matrix = {}

    for var in body.variables:
        row = {}
        for r, rk in zip(ranges, range_keys):
            delta = r / 100.0

            if var == "client_growth_pct":
                adj_ingresos = base_ingresos * (1 + delta)
                adj_costos = base_costos
                adj_margen = adj_ingresos - adj_costos
                adj_margen_pct = (adj_margen / adj_ingresos * 100) if adj_ingresos > 0 else 0
                ebitda_proxy = adj_margen * 0.85

            elif var == "ipc_pct":
                adj_ingresos = base_ingresos
                adj_costos = base_costos * (1 + delta)
                adj_margen = adj_ingresos - adj_costos
                adj_margen_pct = (adj_margen / adj_ingresos * 100) if adj_ingresos > 0 else 0
                ebitda_proxy = adj_margen * 0.85

            elif var == "churn_rate_pct":
                # Increased churn reduces revenue
                churn_impact = abs(delta) * arpu * 12 if delta > 0 else 0
                adj_ingresos = base_ingresos - churn_impact
                adj_costos = base_costos
                adj_margen = adj_ingresos - adj_costos
                adj_margen_pct = (adj_margen / adj_ingresos * 100) if adj_ingresos > 0 else 0
                ebitda_proxy = adj_margen * 0.85

            elif var == "arpu_monthly":
                # ARPU change directly affects revenue
                if arpu > 0:
                    arpu_multiplier = 1 + delta
                    adj_ingresos = base_ingresos * arpu_multiplier
                else:
                    adj_ingresos = base_ingresos * (1 + delta)
                adj_costos = base_costos
                adj_margen = adj_ingresos - adj_costos
                adj_margen_pct = (adj_margen / adj_ingresos * 100) if adj_ingresos > 0 else 0
                ebitda_proxy = adj_margen * 0.85

            elif var == "tariff_adjustment_pct":
                adj_ingresos = base_ingresos * (1 + delta)
                adj_costos = base_costos
                adj_margen = adj_ingresos - adj_costos
                adj_margen_pct = (adj_margen / adj_ingresos * 100) if adj_ingresos > 0 else 0
                ebitda_proxy = adj_margen * 0.85

            elif var == "salary_increase_pct":
                # Salary increases affect fixed costs
                adj_ingresos = base_ingresos
                salary_portion = summary.get("costos_fijos", base_costos * 0.6)
                adj_costos = base_costos + salary_portion * delta
                adj_margen = adj_ingresos - adj_costos
                adj_margen_pct = (adj_margen / adj_ingresos * 100) if adj_ingresos > 0 else 0
                ebitda_proxy = adj_margen * 0.85

            elif var == "energy_cost_change_pct":
                adj_ingresos = base_ingresos
                variable_portion = summary.get("costos_variables", base_costos * 0.4)
                adj_costos = base_costos + variable_portion * delta
                adj_margen = adj_ingresos - adj_costos
                adj_margen_pct = (adj_margen / adj_ingresos * 100) if adj_ingresos > 0 else 0
                ebitda_proxy = adj_margen * 0.85

            else:
                # Generic: affects revenue proportionally
                adj_ingresos = base_ingresos * (1 + delta)
                adj_costos = base_costos
                adj_margen = adj_ingresos - adj_costos
                adj_margen_pct = (adj_margen / adj_ingresos * 100) if adj_ingresos > 0 else 0
                ebitda_proxy = adj_margen * 0.85

            row[rk] = {
                "ingresos": round(adj_ingresos, 0),
                "costos": round(adj_costos, 0),
                "margen": round(adj_margen, 0),
                "margen_pct": round(adj_margen_pct, 2),
                "ebitda_proxy": round(ebitda_proxy, 0),
            }
        matrix[var] = row

    # Ask ARIA to narrate the sensitivity results
    context = _build_bp_context(bp, assumptions)
    matrix_summary = json.dumps(matrix, indent=2, default=str)
    narration_prompt = f"""Se realizó un análisis de sensibilidad numérico sobre las siguientes variables: {', '.join(body.variables)}.

Matriz de resultados calculados:
{matrix_summary}

Proporciona una narrativa ejecutiva concisa (máx. 300 palabras) que:
1. Identifique la variable de mayor impacto en el margen
2. Señale el punto de equilibrio crítico
3. Recomiende qué variable monitorear con mayor urgencia y por qué

Finaliza con "Puntos Críticos de Atención"."""

    narration, log_id = await _call_aria(
        db=db,
        prompt_user=narration_prompt,
        bp_id=bp_id,
        audit_type="sensitivity",
        requested_by_id=current_user.id,
        additional_context=context,
    )

    # Update log with structured output
    result2 = await db.execute(select(BPAuditLog).where(BPAuditLog.id == log_id))
    log = result2.scalar_one_or_none()
    if log:
        log.structured_output = {"matrix": matrix}
        log.snapshot_metrics = summary

    await db.commit()

    return {
        "matrix": matrix,
        "variables": body.variables,
        "ranges": range_keys,
        "base_values": {
            "ingresos": base_ingresos,
            "costos": base_costos,
            "margen": base_margen,
            "margen_pct": summary["margen_pct"],
        },
        "narration": narration,
        "audit_log_id": log_id,
    }


# ─── Endpoint 7: POST /bp/{bp_id}/aria/chat ──────────────────────────────────

@router.post("/bp/{bp_id}/aria/chat")
async def aria_chat(
    bp_id: int,
    body: ARIAChatMessage,
    db: DB,
    current_user: CurrentUser,
):
    bp = await _get_bp_or_404(db, bp_id)

    result = await db.execute(
        select(BPAssumptions).where(
            BPAssumptions.business_id == bp.business_id,
            BPAssumptions.year == bp.year,
            BPAssumptions.is_deleted == False,
        )
    )
    assumptions = result.scalar_one_or_none()

    context = _build_bp_context(bp, assumptions)

    text, log_id = await _call_aria(
        db=db,
        prompt_user=body.message,
        bp_id=bp_id,
        audit_type="chat",
        requested_by_id=current_user.id,
        additional_context=context,
    )

    await db.commit()

    return {
        "response": text,
        "audit_log_id": log_id,
        "structured_data": None,
    }


# ─── Endpoint 8: GET /bp/{bp_id}/aria/history ────────────────────────────────

@router.get("/bp/{bp_id}/aria/history")
async def get_history(
    bp_id: int,
    db: DB,
    current_user: CurrentUser,
):
    # Verify BP exists
    bp_result = await db.execute(
        select(BusinessPlan).where(BusinessPlan.id == bp_id, BusinessPlan.is_deleted == False)
    )
    if not bp_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Business Plan no encontrado")

    result = await db.execute(
        select(BPAuditLog)
        .options(selectinload(BPAuditLog.requested_by))
        .where(BPAuditLog.bp_id == bp_id)
        .order_by(BPAuditLog.created_at.desc())
        .limit(20)
    )
    logs = result.scalars().all()
    return [_audit_to_dict(l) for l in logs]


# ─── Endpoint 9: GET /bp/{bp_id}/aria/scenarios ──────────────────────────────

@router.get("/bp/{bp_id}/aria/scenarios")
async def get_scenarios(
    bp_id: int,
    db: DB,
    current_user: CurrentUser,
):
    bp_result = await db.execute(
        select(BusinessPlan).where(BusinessPlan.id == bp_id, BusinessPlan.is_deleted == False)
    )
    if not bp_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Business Plan no encontrado")

    result = await db.execute(
        select(BPScenario)
        .where(BPScenario.bp_id == bp_id, BPScenario.is_deleted == False)
        .order_by(BPScenario.created_at.desc())
    )
    scenarios = result.scalars().all()
    return [_scenario_to_dict(s) for s in scenarios]


# ─── Endpoint 10: PATCH /bp/{bp_id}/aria/scenarios/{scenario_id} ─────────────

@router.patch("/bp/{bp_id}/aria/scenarios/{scenario_id}")
async def update_scenario(
    bp_id: int,
    scenario_id: int,
    body: dict,
    db: DB,
    current_user: LeaderOrAdmin,
):
    result = await db.execute(
        select(BPScenario).where(
            BPScenario.id == scenario_id,
            BPScenario.bp_id == bp_id,
            BPScenario.is_deleted == False,
        )
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise HTTPException(status_code=404, detail="Escenario no encontrado")

    for field in ["name", "description", "probability_pct", "line_adjustments"]:
        if field in body:
            setattr(scenario, field, body[field])

    await db.commit()
    await db.refresh(scenario)
    return _scenario_to_dict(scenario)


# ─── Endpoint 11: GET /bp/{bp_id}/premisas ───────────────────────────────────

@router.get("/bp/{bp_id}/premisas")
async def get_bp_premisas(
    bp_id: int,
    db: DB,
    current_user: CurrentUser,
):
    """Return all premisas linked to the BP's business and year (centralized view)."""
    bp_result = await db.execute(
        select(BusinessPlan)
        .options(selectinload(BusinessPlan.business))
        .where(BusinessPlan.id == bp_id, BusinessPlan.is_deleted == False)
    )
    bp = bp_result.scalar_one_or_none()
    if not bp:
        raise HTTPException(status_code=404, detail="Business Plan no encontrado")

    q = (
        select(PremisaNegocio)
        .where(
            PremisaNegocio.is_deleted == False,
            PremisaNegocio.business_id == bp.business_id,
        )
        .order_by(PremisaNegocio.created_at.desc())
    )
    # Also include premisas for the same budget_year if set
    result = await db.execute(q)
    premisas = result.scalars().all()

    # Map line premisa_ids so UI can show which lines already reference each premisa
    lines_result = await db.execute(
        select(BPLine).where(BPLine.bp_id == bp_id, BPLine.is_deleted == False)
    )
    lines = lines_result.scalars().all()
    premisa_to_lines: dict[int, list[dict]] = {}
    for l in lines:
        if l.premisa_id:
            premisa_to_lines.setdefault(l.premisa_id, []).append({
                "id": l.id, "name": l.name, "category": l.category.value if hasattr(l.category, "value") else l.category,
            })

    return [
        {
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "category": p.category,
            "status": p.status.value if hasattr(p.status, "value") else p.status,
            "budget_year": p.budget_year,
            "budget_line": p.budget_line,
            "estimated_amount": float(p.estimated_amount) if p.estimated_amount else None,
            "actual_amount": float(p.actual_amount) if p.actual_amount else None,
            "variance_pct": float(p.variance_pct) if p.variance_pct else None,
            "assumption_basis": p.assumption_basis,
            "risk_if_wrong": p.risk_if_wrong,
            "recommendations": p.recommendations,
            "ai_recommendation": p.ai_recommendation,
            "review_date": str(p.review_date) if p.review_date else None,
            "responsible_name": p.responsible_name,
            "linked_lines": premisa_to_lines.get(p.id, []),
        }
        for p in premisas
    ]


# ─── Endpoint 12: POST /bp/{bp_id}/aria/link-premisas ────────────────────────

@router.post("/bp/{bp_id}/aria/link-premisas")
async def link_premisas_with_ai(
    bp_id: int,
    db: DB,
    current_user: CurrentUser,
):
    """
    ARIA analyzes the BP lines and the associated premisas, then suggests
    which lines map to which premisas (with rationale).
    Also applies the suggested links to bp_lines.premisa_id automatically.
    """
    bp = await _get_bp_or_404(db, bp_id)

    # Get premisas for this business
    premisas_result = await db.execute(
        select(PremisaNegocio).where(
            PremisaNegocio.business_id == bp.business_id,
            PremisaNegocio.is_deleted == False,
        )
    )
    premisas = premisas_result.scalars().all()

    lines = [l for l in bp.lines if not l.is_deleted]
    summary = _compute_bp_summary(lines)

    if not premisas:
        return {
            "message": "No hay premisas registradas para este negocio. Crea premisas primero en el módulo de Premisas.",
            "associations": [],
        }

    # Build premisas context
    premisas_ctx = "\n".join([
        f"  - PREMISA #{p.id}: '{p.title}' | Categoría: {p.category} | "
        f"Monto estimado: {'$' + format(float(p.estimated_amount), ',.0f') + ' COP' if p.estimated_amount else 'N/D'} | "
        f"Base: {p.assumption_basis or 'N/D'}"
        for p in premisas
    ])

    lines_ctx = "\n".join([
        f"  - LÍNEA #{l.id}: '{l.name}' | Categoría: {l.category.value if hasattr(l.category, 'value') else l.category} | "
        f"Subcategoría: {l.subcategory or 'N/D'} | Total anual: {'$' + format(l.annual_plan, ',.0f') + ' COP' if l.annual_plan else 'N/D'}"
        for l in lines
    ])

    prompt = f"""Eres ARIA. Analiza estas líneas presupuestales y las premisas de negocio del BP '{bp.business.name if bp.business else ""} {bp.year}'.

LÍNEAS PRESUPUESTALES:
{lines_ctx if lines_ctx else 'Sin líneas definidas.'}

PREMISAS DE NEGOCIO:
{premisas_ctx if premisas_ctx else 'Sin premisas definidas.'}

TAREA: Para cada línea presupuestal, identifica qué premisa la sustenta o justifica.
Responde EXCLUSIVAMENTE en JSON con este formato exacto (sin texto adicional, sin markdown):
{{
  "associations": [
    {{
      "line_id": <int>,
      "premisa_id": <int or null>,
      "confidence": <0-100>,
      "rationale": "<1 oración explicando el vínculo>"
    }}
  ],
  "summary": "<2-3 oraciones sobre la coherencia entre premisas y líneas>"
}}

Si una línea no tiene premisa relevante, usa premisa_id: null.
Solo incluye líneas que tengan una asociación natural y bien fundamentada."""

    text, log_id = await _call_aria(
        db=db,
        prompt_user=prompt,
        bp_id=bp_id,
        audit_type="link_premisas",
        requested_by_id=current_user.id,
    )

    # Parse JSON from response
    associations = []
    summary_text = ""
    try:
        # Strip markdown code fences if present
        clean = text.strip()
        if clean.startswith("```"):
            clean = re.sub(r"^```[a-z]*\n?", "", clean)
            clean = re.sub(r"\n?```$", "", clean)
        parsed = json.loads(clean)
        associations = parsed.get("associations", [])
        summary_text = parsed.get("summary", "")
    except Exception:
        pass

    # Apply associations to bp_lines
    applied = []
    for assoc in associations:
        line_id = assoc.get("line_id")
        premisa_id = assoc.get("premisa_id")
        confidence = assoc.get("confidence", 0)
        if line_id and confidence >= 60:  # only apply high-confidence suggestions
            line_result = await db.execute(
                select(BPLine).where(BPLine.id == line_id, BPLine.bp_id == bp_id)
            )
            line = line_result.scalar_one_or_none()
            if line:
                line.premisa_id = premisa_id
                line.ai_rationale = assoc.get("rationale", "")
                applied.append(line_id)

    # Update audit log
    log_result = await db.execute(select(BPAuditLog).where(BPAuditLog.id == log_id))
    log = log_result.scalar_one_or_none()
    if log:
        log.structured_output = {"associations": associations, "summary": summary_text, "applied_count": len(applied)}
        log.snapshot_metrics = summary

    await db.commit()

    return {
        "associations": associations,
        "summary": summary_text,
        "applied_line_ids": applied,
        "audit_log_id": log_id,
        "message": f"ARIA analizó {len(lines)} líneas y {len(premisas)} premisas. {len(applied)} asociaciones aplicadas automáticamente.",
    }


# ─── Endpoint 13: PATCH /bp/{bp_id}/lines/{line_id}/link-premisa ─────────────

@router.patch("/bp/{bp_id}/lines/{line_id}/link-premisa")
async def link_line_to_premisa(
    bp_id: int,
    line_id: int,
    body: dict,
    db: DB,
    current_user: CurrentUser,
):
    """Manually link or unlink a BP line to a premisa."""
    line_result = await db.execute(
        select(BPLine).where(BPLine.id == line_id, BPLine.bp_id == bp_id, BPLine.is_deleted == False)
    )
    line = line_result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")

    line.premisa_id = body.get("premisa_id")  # pass null to unlink
    await db.commit()
    return {"id": line.id, "premisa_id": line.premisa_id, "message": "Asociación actualizada"}


# ─── Endpoint 14: GET/PUT /bp-ai/assumptions — client volume fields ───────────
# (existing endpoints already handle these; the new fields are included automatically
#  via the updated BPAssumptions model — no extra endpoint needed)
