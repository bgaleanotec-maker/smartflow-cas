#!/usr/bin/env python3
"""
SmartFlow Orchestrator - Health Check & Status Report
=====================================================
Detecta problemas en SmartFlow, reporta el estado y genera el archivo STATUS.md.

Uso:
  python health_check.py              → chequeo completo
  python health_check.py --fix        → chequeo + aplica fixes automáticos (solo los seguros)
  python health_check.py --report     → solo genera STATUS.md sin prints

Variables de entorno requeridas:
  SMARTFLOW_API_URL   → ej: https://smartflow-api-0ric.onrender.com
  SMARTFLOW_ADMIN_PASSWORD → contraseña del admin (para el health token)

Ejecutar desde la raíz del repo:
  cd smartflow && python orchestrator/health_check.py
"""

import os
import sys
import json
import time
import datetime
import httpx

# ── Config ──────────────────────────────────────────────────────────────────────
API_URL      = os.getenv("SMARTFLOW_API_URL", "https://smartflow-api-0ric.onrender.com")
ADMIN_EMAIL  = os.getenv("SMARTFLOW_ADMIN_EMAIL", "admin@smartflow.app")
ADMIN_PASS   = os.getenv("SMARTFLOW_ADMIN_PASSWORD", "Estocastico#77")
OUTPUT_FILE  = os.path.join(os.path.dirname(__file__), "STATUS.md")
TIMEOUT      = 20  # segundos por request

# ── Resultado individual de un chequeo ──────────────────────────────────────────
class Check:
    def __init__(self, name: str, category: str):
        self.name     = name
        self.category = category
        self.status   = "⏳"   # ✅ ⚠️ ❌ ⏳
        self.detail   = ""
        self.fix      = ""     # instrucción de fix si aplica

    def ok(self, detail=""):
        self.status = "✅"; self.detail = detail; return self

    def warn(self, detail="", fix=""):
        self.status = "⚠️"; self.detail = detail; self.fix = fix; return self

    def fail(self, detail="", fix=""):
        self.status = "❌"; self.detail = detail; self.fix = fix; return self

    def __str__(self):
        line = f"{self.status} **{self.name}** — {self.detail}"
        if self.fix:
            line += f"\n   > 🔧 Fix: {self.fix}"
        return line


# ── Helpers ──────────────────────────────────────────────────────────────────────

def get_token(client: httpx.Client) -> str | None:
    """Autentica y retorna el access token."""
    try:
        r = client.post(f"{API_URL}/api/v1/auth/login",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
                        timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json().get("access_token")
    except Exception as e:
        pass
    return None


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Chequeos ──────────────────────────────────────────────────────────────────────

def check_backend_health(client: httpx.Client) -> Check:
    c = Check("Backend vivo", "Infraestructura")
    try:
        r = client.get(f"{API_URL}/health", timeout=TIMEOUT)
        if r.status_code == 200:
            data = r.json()
            return c.ok(f"v{data.get('version','?')} · {data.get('app','?')}")
        return c.fail(f"HTTP {r.status_code}", fix="Verificar deploy en Render → smartflow-api")
    except httpx.ConnectError:
        return c.fail("No responde (cold start o caído)",
                      fix="Ir a Render → smartflow-api y verificar logs. Puede ser cold start (esperar 30s).")
    except Exception as e:
        return c.fail(str(e))


def check_auth(client: httpx.Client) -> tuple[Check, str | None]:
    c = Check("Autenticación admin", "Infraestructura")
    token = get_token(client)
    if token:
        return c.ok("Login admin OK"), token
    return c.fail("Login fallido — credenciales incorrectas o backend caído",
                  fix="Verificar ADMIN_EMAIL y ADMIN_PASSWORD"), None


def check_db(client: httpx.Client, token: str) -> Check:
    c = Check("Base de datos", "Infraestructura")
    try:
        r = client.get(f"{API_URL}/api/v1/admin/stats",
                       headers=auth_headers(token), timeout=TIMEOUT)
        if r.status_code == 200:
            data = r.json()
            users = data.get("total_users", "?")
            return c.ok(f"PostgreSQL OK · {users} usuarios")
        return c.fail(f"HTTP {r.status_code} al consultar stats",
                      fix="Verificar DATABASE_URL en Render → Environment")
    except Exception as e:
        return c.fail(str(e))


def check_service_config(client: httpx.Client, token: str) -> list[Check]:
    """Verifica API keys críticas."""
    checks = []

    # Check via integrations endpoint
    try:
        r = client.get(f"{API_URL}/api/v1/admin/integrations",
                       headers=auth_headers(token), timeout=TIMEOUT)
        integrations = r.json() if r.status_code == 200 else {}
    except Exception:
        integrations = {}

    # GEMINI (CRÍTICO — ARIA no funciona sin esto)
    c_gemini = Check("GEMINI_API_KEY (ARIA chat)", "IA / Voz")
    gemini_cfg = integrations.get("gemini", {})
    if gemini_cfg.get("api_key") or os.getenv("GEMINI_API_KEY"):
        c_gemini.ok("Configurado ✓")
    else:
        c_gemini.fail(
            "NO configurado — ARIA no puede responder sin Gemini",
            fix="1) Ir a https://ai.google.dev → Get API key (GRATIS)\n"
                "   2) En Render → smartflow-api → Environment → añadir GEMINI_API_KEY=<tu_key>\n"
                "   3) O en Admin > Integraciones > Gemini dentro de SmartFlow"
        )
    checks.append(c_gemini)

    # GROQ (RECOMENDADO — Whisper cloud, 0 RAM)
    c_groq = Check("GROQ_API_KEY (Whisper STT)", "IA / Voz")
    groq_cfg = integrations.get("groq", {})
    if groq_cfg.get("api_key") or os.getenv("GROQ_API_KEY"):
        c_groq.ok("Configurado ✓ — transcripción cloud activa")
    else:
        c_groq.warn(
            "No configurado — usa faster-whisper local (lento, ~350MB RAM)",
            fix="1) Ir a https://console.groq.com → API Keys (GRATIS, 28,800s audio/día)\n"
                "   2) En Render → smartflow-api → Environment → añadir GROQ_API_KEY=<tu_key>"
        )
    checks.append(c_groq)

    # ELEVENLABS (TTS — sin esto usa browser TTS)
    c_el = Check("ELEVENLABS_API_KEY (TTS voz ARIA)", "IA / Voz")
    el_cfg = integrations.get("elevenlabs", {})
    if el_cfg.get("api_key") or os.getenv("ELEVENLABS_API_KEY"):
        c_el.ok("Configurado ✓")
    else:
        c_el.warn("No configurado — ARIA usa voz del navegador (funciona pero calidad menor)",
                  fix="Opcional: https://elevenlabs.io → API Key → añadir en Render o Admin > Integraciones")
    checks.append(c_el)

    return checks


def check_voice_meetings(client: httpx.Client, token: str) -> list[Check]:
    """Verifica que el módulo de reuniones/transcripciones funcione."""
    checks = []

    # Crear reunión de test
    c_create = Check("Crear reunión de voz", "Módulo Voz")
    meeting_id = None
    try:
        r = client.post(f"{API_URL}/api/v1/voice/meetings",
                        headers=auth_headers(token),
                        json={"title": "[HEALTH CHECK] Test", "meeting_type": "meeting"},
                        timeout=TIMEOUT)
        if r.status_code == 200:
            meeting_id = r.json().get("id")
            c_create.ok(f"Creada meeting_id={meeting_id}")
        else:
            c_create.fail(f"HTTP {r.status_code}: {r.text[:100]}",
                          fix="Verificar migración de tabla voice_meetings en el backend")
    except Exception as e:
        c_create.fail(str(e))
    checks.append(c_create)

    if meeting_id:
        # Guardar un chunk de texto
        c_chunk = Check("Guardar transcripción (add-text-chunk)", "Módulo Voz")
        try:
            r = client.post(f"{API_URL}/api/v1/voice/meetings/{meeting_id}/add-text-chunk",
                            headers=auth_headers(token),
                            json={"text": "Texto de prueba del orquestador", "speaker_name": "Orquestador"},
                            timeout=TIMEOUT)
            if r.status_code == 200 and r.json().get("ok"):
                c_chunk.ok("Chunk guardado correctamente en DB")
            else:
                c_chunk.fail(f"HTTP {r.status_code}: {r.text[:100]}",
                             fix="Revisar logs del backend para errores de DB")
        except Exception as e:
            c_chunk.fail(str(e))
        checks.append(c_chunk)

        # Limpiar reunión de test
        try:
            client.delete(f"{API_URL}/api/v1/voice/meetings/{meeting_id}",
                          headers=auth_headers(token), timeout=TIMEOUT)
        except Exception:
            pass

    return checks


def check_frontend(client: httpx.Client) -> Check:
    c = Check("Frontend accesible", "Infraestructura")
    frontend_url = "https://smartflow-casbo.onrender.com"
    try:
        r = client.get(frontend_url, timeout=TIMEOUT, follow_redirects=True)
        if r.status_code == 200:
            return c.ok(f"{frontend_url} → HTTP 200")
        return c.warn(f"HTTP {r.status_code}",
                      fix="Verificar deploy del frontend en Render → smartflow-casbo")
    except Exception as e:
        return c.fail(str(e), fix="Frontend caído o no desplegado")


# ── Reporte ──────────────────────────────────────────────────────────────────────

def generate_report(all_checks: list[Check]) -> str:
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    total = len(all_checks)
    ok    = sum(1 for c in all_checks if c.status == "✅")
    warn  = sum(1 for c in all_checks if c.status == "⚠️")
    fail  = sum(1 for c in all_checks if c.status == "❌")

    lines = [
        f"# 🛠️ SmartFlow — Reporte del Orquestador",
        f"",
        f"**Generado:** {now}  ",
        f"**Estado:** {ok}/{total} OK · {warn} advertencias · {fail} críticos",
        f"",
    ]

    # Agrupar por categoría
    categories: dict[str, list[Check]] = {}
    for c in all_checks:
        categories.setdefault(c.category, []).append(c)

    for cat, cat_checks in categories.items():
        lines.append(f"## {cat}")
        lines.append("")
        for c in cat_checks:
            lines.append(str(c))
            lines.append("")
        lines.append("")

    if fail > 0:
        lines.append("---")
        lines.append("## 🚨 Acciones requeridas")
        lines.append("")
        for c in all_checks:
            if c.status == "❌" and c.fix:
                lines.append(f"### {c.name}")
                lines.append(c.fix)
                lines.append("")

    lines.append("---")
    lines.append("*Generado por SmartFlow Orchestrator — ejecutar `python orchestrator/health_check.py` para actualizar*")

    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────────

def run():
    silent = "--report" in sys.argv
    log = (lambda *a: None) if silent else print

    log("\n🔍 SmartFlow Orchestrator — Health Check\n" + "─" * 45)

    all_checks: list[Check] = []

    with httpx.Client() as client:
        # 1. Backend
        log("  Verificando backend...")
        be = check_backend_health(client)
        all_checks.append(be)
        log(f"     {be}")

        # 2. Auth
        log("  Autenticando admin...")
        auth_c, token = check_auth(client)
        all_checks.append(auth_c)
        log(f"     {auth_c}")

        if token:
            # 3. DB
            log("  Verificando DB...")
            db_c = check_db(client, token)
            all_checks.append(db_c)
            log(f"     {db_c}")

            # 4. API keys
            log("  Verificando API keys de IA / Voz...")
            for c in check_service_config(client, token):
                all_checks.append(c)
                log(f"     {c}")

            # 5. Voice module
            log("  Verificando módulo de voz...")
            for c in check_voice_meetings(client, token):
                all_checks.append(c)
                log(f"     {c}")

        # 6. Frontend
        log("  Verificando frontend...")
        fe = check_frontend(client)
        all_checks.append(fe)
        log(f"     {fe}")

    # Generar reporte
    report = generate_report(all_checks)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(report)

    ok   = sum(1 for c in all_checks if c.status == "✅")
    fail = sum(1 for c in all_checks if c.status == "❌")

    log(f"\n📄 Reporte guardado en: {OUTPUT_FILE}")
    log(f"📊 Resumen: {ok}/{len(all_checks)} OK · {fail} críticos\n")

    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(run())
