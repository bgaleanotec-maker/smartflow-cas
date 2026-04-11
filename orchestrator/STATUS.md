# 🛠️ SmartFlow — Estado del Sistema

> Este archivo se actualiza automáticamente por el Orquestador.
> Para actualizar manualmente: `python orchestrator/health_check.py`

**Última actualización:** Pendiente — ejecutar health_check.py

---

## Issues conocidos y su estado

| # | Área | Problema | Fix | Estado |
|---|------|----------|-----|--------|
| 1 | IA / Voz | GEMINI_API_KEY no configurado → ARIA no responde | Agregar key en Render Dashboard → Environment | 🔴 Pendiente |
| 2 | IA / Voz | GROQ_API_KEY no configurado → Whisper usa RAM local | Agregar key gratis en console.groq.com | 🟡 Opcional |
| 3 | IA / Voz | ARIA chat no guardaba transcripciones | ✅ Corregido en este PR — meeting persistente | ✅ Resuelto |
| 4 | IA / Voz | VAD fallback creaba y borraba meetings temp | ✅ Corregido — usa meeting persistente | ✅ Resuelto |
| 5 | Config | GEMINI_API_KEY no en _ENV_FALLBACK_MAP | ✅ Corregido en config.py | ✅ Resuelto |
| 6 | Deploy | render.yaml no tenía GEMINI_API_KEY ni GROQ_API_KEY | ✅ Corregido — añadidos como sync:false | ✅ Resuelto |

---

*Generado por SmartFlow Orchestrator*
