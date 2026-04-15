# 🛠️ SmartFlow — Reporte del Orquestador

**Generado:** 2026-04-14 08:10:00  
**Modo:** Análisis estático (network egress bloqueado desde sandbox — ver nota al pie)  
**Estado:** Análisis de configuración completado · Conectividad directa no disponible desde este entorno

---

## ⚠️ Nota sobre el entorno de ejecución

El sandbox de Cowork **no tiene acceso de red saliente** a `smartflow-api-0ric.onrender.com` ni `smartflow-casbo.onrender.com` (egress bloqueado por proxy). Los chequeos de conectividad en vivo no pudieron ejecutarse. Este reporte se basa en análisis de `render.yaml` y `backend/.env`.

---

## Infraestructura

✅ **Backend configurado** — Render standard plan (sin cold start), Dockerfile en `backend/`, healthCheckPath: `/health`

✅ **Base de datos** — PostgreSQL en Render (plan free), conectada via `DATABASE_URL` desde `smartflow-db`

✅ **Frontend configurado** — Static site en Render free, apunta a `https://smartflow-api-0ric.onrender.com/api/v1`

⚠️ **SECRET_KEY** — `generateValue: true` en render.yaml (Render la auto-genera en el primer deploy). OK si ya fue desplegado; si es un deploy nuevo, asegurarse de que JWT tokens no expiren por cambio de key.


## IA / Voz

✅ **GEMINI_API_KEY** — Configurado en `render.yaml` (`AIzaSyCPu...`) → ARIA puede responder

✅ **DEEPGRAM_API_KEY** — Configurado en `render.yaml` → Transcripción con diarización activa

✅ **ELEVENLABS_API_KEY** — Configurado en `render.yaml` → Voz ARIA (TTS de calidad)

⚠️ **OPENAI_API_KEY** — `sync: false` en render.yaml → **Debe configurarse manualmente en Render dashboard**
   > 🔧 Fix: Render → smartflow-api → Environment → añadir `OPENAI_API_KEY=sk-proj-mCEjv85...hkL4A` (la key está en `backend/.env`)

⚠️ **GROQ_API_KEY** — `sync: false` en render.yaml → No configurado (opcional, fallback Whisper)
   > 🔧 Fix (opcional): https://console.groq.com → API Keys → añadir `GROQ_API_KEY` en Render si se quiere fallback cloud Whisper gratuito


## Módulo Voz

⚠️ **STT (Speech-to-Text)** — Depende de `OPENAI_API_KEY` (Whisper cloud). Si esa key no está en el dashboard de Render, el STT fallará en producción.

✅ **TTS (Text-to-Speech)** — ElevenLabs configurado → ARIA habla correctamente

✅ **Diarización** — Deepgram configurado → identificación de hablantes en reuniones activa


---

## 🚨 Acciones requeridas (ordenadas por impacto)

### 1. OPENAI_API_KEY — CRÍTICO para STT
El `render.yaml` tiene `sync: false`, lo que significa que esta variable **NO se sube automáticamente** al deploy. Sin ella, Whisper no funciona y las transcripciones de reuniones fallan.

**Pasos:**
1. Ir a https://dashboard.render.com → Servicio `smartflow-api` → Environment
2. Añadir variable: `OPENAI_API_KEY` = (ver backend/.env — no exponer en este archivo)
3. Guardar → el servicio se redespliega automáticamente

### 2. Verificar connectivity manual desde navegador
Para confirmar el estado real del servicio, abrir desde Chrome:
- Backend: https://smartflow-api-0ric.onrender.com/health
- Frontend: https://smartflow-casbo.onrender.com

### 3. GROQ_API_KEY — RECOMENDADO (opcional)
Añadir en Render para tener fallback de Whisper cloud gratuito (28,800s audio/día).
- https://console.groq.com → API Keys → añadir `GROQ_API_KEY` en Render → smartflow-api → Environment


---

## 📋 Resumen de variables de entorno en Render

| Variable | Estado en render.yaml | Riesgo |
|---|---|---|
| `DATABASE_URL` | ✅ Auto desde DB | OK |
| `SECRET_KEY` | ✅ Auto-generada | OK |
| `GEMINI_API_KEY` | ✅ Valor hardcoded | OK — ARIA activa |
| `DEEPGRAM_API_KEY` | ✅ Valor hardcoded | OK |
| `ELEVENLABS_API_KEY` | ✅ Valor hardcoded | OK |
| `ELEVENLABS_VOICE_ID` | ✅ Valor hardcoded | OK |
| `OPENAI_API_KEY` | ⚠️ `sync: false` | **CONFIGURAR MANUAL** |
| `GROQ_API_KEY` | ⚠️ `sync: false` | Opcional |


---

*Generado por SmartFlow Orchestrator — análisis estático de configuración 2026-04-14*  
*Para chequeo en vivo, ejecutar `python orchestrator/health_check.py` desde una máquina con acceso a internet irrestricto.*
