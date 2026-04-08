from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.deps import DB, CurrentUser
from app.core.config import get_service_config_value
import httpx

router = APIRouter(prefix="/ai", tags=["AI Assistant"])


class AIPrompt(BaseModel):
    prompt: str
    context: Optional[str] = None
    module: str = "general"  # general, demand, hechos, premisas


@router.post("/assist")
async def ai_assist(payload: AIPrompt, db: DB, user: CurrentUser):
    """AI assistant powered by Gemini for demand management guidance."""
    api_key = await get_service_config_value(db, "gemini", "api_key")

    if not api_key:
        # Fallback: provide structured recommendations without AI
        return _fallback_recommendations(payload)

    model = await get_service_config_value(db, "gemini", "model") or "gemini-pro"

    system_context = {
        "demand": "Eres un asistente experto en gestion de demanda TI para la empresa Vanti (servicios publicos en Colombia). Ayudas a priorizar demandas, estimar tiempos, identificar riesgos y dar recomendaciones. Responde siempre en espanol.",
        "hechos": "Eres un asistente que analiza hechos relevantes del negocio. Ayudas a identificar tendencias, impactos comerciales y acciones recomendadas. Responde en espanol.",
        "premisas": "Eres un asistente experto en planificacion presupuestaria. Ayudas a validar premisas de negocio, identificar riesgos en supuestos y dar recomendaciones para el presupuesto. Responde en espanol.",
        "general": "Eres un asistente de gestion empresarial para CAS BO (Centro de Atencion y Servicios - Back Office) en Vanti. Responde en espanol.",
    }

    full_prompt = f"{system_context.get(payload.module, system_context['general'])}\n\nContexto: {payload.context or 'Sin contexto adicional'}\n\nPregunta: {payload.prompt}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={api_key}",
                json={
                    "contents": [{"parts": [{"text": full_prompt}]}],
                    "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1024},
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return {"success": True, "response": text, "source": "gemini"}
            return {"success": False, "response": f"Error API: {resp.status_code}", "source": "error"}
    except Exception as e:
        return _fallback_recommendations(payload)


def _fallback_recommendations(payload: AIPrompt):
    """Structured recommendations when AI is not available."""
    recommendations = {
        "demand": {
            "response": "**Recomendaciones para Gestion de Demanda:**\n\n"
            "1. **Prioriza** demandas con impacto en pilares estrategicos y beneficio economico cuantificable\n"
            "2. **Valida** que todos los requerimientos funcionales tengan criterios de aceptacion claros\n"
            "3. **Asigna** un radicado y responsable dentro de las primeras 48 horas\n"
            "4. **Revisa** semanalmente el backlog de demandas en evaluacion\n"
            "5. **Escala** demandas bloqueadas por mas de 15 dias al sponsor",
        },
        "hechos": {
            "response": "**Recomendaciones para Hechos Relevantes:**\n\n"
            "1. **Documenta** cada hecho con impacto, accion requerida y responsable\n"
            "2. **Clasifica** por nivel de impacto para priorizar seguimiento\n"
            "3. **Revisa** semanalmente los hechos en seguimiento\n"
            "4. **Conecta** hechos recurrentes con demandas o proyectos existentes",
        },
        "premisas": {
            "response": "**Recomendaciones para Premisas de Presupuesto:**\n\n"
            "1. **Revisa** premisas trimestralmente contra datos reales\n"
            "2. **Identifica** premisas con varianza > 10% para accion inmediata\n"
            "3. **Documenta** la base de cada premisa para trazabilidad\n"
            "4. **Actualiza** montos reales mensualmente para seguimiento oportuno",
        },
    }
    result = recommendations.get(payload.module, {"response": "Configura la API de Gemini en Integraciones para obtener asistencia con IA personalizada."})
    return {"success": True, "response": result["response"], "source": "fallback"}
