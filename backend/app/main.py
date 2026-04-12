from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.database import engine, Base

# Import all models to ensure they're registered before create_all
import app.models  # noqa: F401

from app.routers import auth, users, projects, tasks, incidents, admin, pomodoro, demands, demand_admin, hechos, premisas, ai_assistant, activities, dashboard_builder, lean_pro, ai_chat, business_plan, bp_financial_ai, executive, voice, reminders


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (use Alembic in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Run column migrations for tables that existed before new columns were added
    await _run_column_migrations()

    # Seed default data
    await seed_defaults()
    yield


async def _run_column_migrations():
    """Add new columns to existing tables without Alembic.
    Uses IF NOT EXISTS so it is safe to run on every startup."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal, is_sqlite

    migrations = []

    if is_sqlite:
        # SQLite: no IF NOT EXISTS for ADD COLUMN — check pragma first
        migrations = [
            # voice_meetings new context columns (added 2026-04-10)
            ("voice_meetings", "business_id", "INTEGER REFERENCES businesses(id)"),
            ("voice_meetings", "bp_id", "INTEGER REFERENCES business_plans(id)"),
            ("voice_meetings", "bp_activity_id", "INTEGER REFERENCES bp_activities(id)"),
            ("voice_meetings", "auto_linked_actions", "JSON"),
            # bp_activities new scheduling columns (added 2026-03-xx)
            ("bp_activities", "start_date", "DATE"),
            ("bp_activities", "estimated_hours", "FLOAT"),
            ("bp_activities", "actual_hours", "FLOAT"),
            ("bp_activities", "depends_on_id", "INTEGER"),
            ("bp_activities", "is_milestone", "BOOLEAN DEFAULT 0"),
            ("bp_activities", "reminder_days_before", "INTEGER DEFAULT 3"),
            ("bp_activities", "reminder_sent_at", "DATETIME"),
            ("bp_activities", "tags", "JSON"),
            ("bp_activities", "grupo", "VARCHAR(100)"),
            # reminders table is auto-created; no extra columns needed
        ]
        async with AsyncSessionLocal() as db:
            for table, column, col_def in migrations:
                try:
                    result = await db.execute(text(f"PRAGMA table_info({table})"))
                    cols = [row[1] for row in result.fetchall()]
                    if column not in cols:
                        await db.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
                        await db.commit()
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"Migration warning ({table}.{column}): {e}")
    else:
        # PostgreSQL: supports ADD COLUMN IF NOT EXISTS
        pg_migrations = [
            # voice_meetings context FK columns
            "ALTER TABLE voice_meetings ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id)",
            "ALTER TABLE voice_meetings ADD COLUMN IF NOT EXISTS bp_id INTEGER REFERENCES business_plans(id)",
            "ALTER TABLE voice_meetings ADD COLUMN IF NOT EXISTS bp_activity_id INTEGER REFERENCES bp_activities(id)",
            "ALTER TABLE voice_meetings ADD COLUMN IF NOT EXISTS auto_linked_actions JSON",
            # bp_activities scheduling columns
            "ALTER TABLE bp_activities ADD COLUMN IF NOT EXISTS start_date DATE",
            "ALTER TABLE bp_activities ADD COLUMN IF NOT EXISTS estimated_hours FLOAT",
            "ALTER TABLE bp_activities ADD COLUMN IF NOT EXISTS actual_hours FLOAT",
            "ALTER TABLE bp_activities ADD COLUMN IF NOT EXISTS depends_on_id INTEGER",
            "ALTER TABLE bp_activities ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT FALSE",
            "ALTER TABLE bp_activities ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER DEFAULT 3",
            "ALTER TABLE bp_activities ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE",
            "ALTER TABLE bp_activities ADD COLUMN IF NOT EXISTS tags JSON",
            "ALTER TABLE bp_activities ADD COLUMN IF NOT EXISTS grupo VARCHAR(100)",
            # bp_lines AI columns
            "ALTER TABLE bp_lines ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE",
            "ALTER TABLE bp_lines ADD COLUMN IF NOT EXISTS ai_confidence FLOAT",
            "ALTER TABLE bp_lines ADD COLUMN IF NOT EXISTS ai_rationale TEXT",
            "ALTER TABLE bp_lines ADD COLUMN IF NOT EXISTS line_metadata JSON",
            # bp_excel_analyses structured extraction column
            "ALTER TABLE bp_excel_analyses ADD COLUMN IF NOT EXISTS file_type VARCHAR(20)",
            "ALTER TABLE bp_excel_analyses ADD COLUMN IF NOT EXISTS structured_extraction JSON",
            "ALTER TABLE bp_excel_analyses ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP WITH TIME ZONE",
        ]
        async with AsyncSessionLocal() as db:
            for stmt in pg_migrations:
                try:
                    await db.execute(text(stmt))
                    await db.commit()
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"Migration warning: {e}")


async def seed_defaults():
    """Seed initial required data if not present."""
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.core.security import get_password_hash
    from app.models.user import User, UserRole
    from app.models.catalog import Priority, TaskStatus
    from app.models.business import Business

    # Admin seed: only creates the admin if no admin exists yet.
    # Never resets password on redeploy — preserves any password changed via UI.
    ADMIN_EMAIL = "admin@smartflow.app"
    ADMIN_PASSWORD = "Estocastico#77"

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.email == ADMIN_EMAIL).limit(1)
        )
        existing_admin = result.scalar_one_or_none()
        if existing_admin is None:
            admin = User(
                full_name="Administrador SmartFlow",
                email=ADMIN_EMAIL,
                hashed_password=get_password_hash(ADMIN_PASSWORD),
                role=UserRole.ADMIN,
                must_change_password=False,
                is_active=True,
            )
            db.add(admin)

        # Seed priorities
        result = await db.execute(select(Priority).limit(1))
        if not result.scalar_one_or_none():
            for idx, (name, color) in enumerate([
                ("Crítica", "#ef4444"),
                ("Alta", "#f97316"),
                ("Media", "#eab308"),
                ("Baja", "#22c55e"),
            ]):
                db.add(Priority(name=name, color=color, order_index=idx))

        # Seed default task statuses
        result = await db.execute(select(TaskStatus).where(TaskStatus.project_id == None).limit(1))
        if not result.scalar_one_or_none():
            for idx, (name, color, is_done) in enumerate([
                ("Por Hacer", "#94a3b8", False),
                ("En Progreso", "#3b82f6", False),
                ("En Revisión", "#f59e0b", False),
                ("Hecho", "#22c55e", True),
            ]):
                db.add(TaskStatus(name=name, color=color, order_index=idx, is_done_state=is_done))

        # Seed businesses
        result = await db.execute(select(Business).limit(1))
        if not result.scalar_one_or_none():
            for name, color in [
                ("Vantilisto", "#6366f1"),
                ("N.Edificación", "#0ea5e9"),
            ]:
                db.add(Business(name=name, color=color))

        # Seed demand catalogs
        from app.models.demand_catalog import DemandCatalog
        result = await db.execute(select(DemandCatalog).limit(1))
        if not result.scalar_one_or_none():
            catalogs = [
                # Vicepresidencias
                ("vicepresidencia", "Vicepresidencia de Tecnologia", 0),
                ("vicepresidencia", "Vicepresidencia Comercial", 1),
                ("vicepresidencia", "Vicepresidencia Financiera", 2),
                ("vicepresidencia", "Vicepresidencia de Operaciones", 3),
                ("vicepresidencia", "Vicepresidencia Juridica", 4),
                ("vicepresidencia", "Vicepresidencia de Talento Humano", 5),
                ("vicepresidencia", "Gerencia General", 6),
                # Enfoques
                ("enfoque", "Nuevo sistema o aplicacion en la nube", 0),
                ("enfoque", "Modificacion de funcionalidades existentes (pantallas, campos, funcionalidades)", 1),
                ("enfoque", "Adquisicion de servicio, consultoria o materiales/equipos", 2),
                ("enfoque", "Parametrizacion o configuracion de sistema existente", 3),
                ("enfoque", "Disponibilizacion de datos, tableros, reportes o modelos analiticos", 4),
                ("enfoque", "Automatizacion sencilla con Power Platform", 5),
                ("enfoque", "Desarrollo de procesos de extraccion nuevos", 6),
                ("enfoque", "Mejora o modificacion de procesos de extraccion existentes", 7),
                # Pilares estrategicos
                ("pilares", "Impacto en 1 pilar Estrategico", 0),
                ("pilares", "Impacto en 2 pilares Estrategicos", 1),
                ("pilares", "Impacto en 3 pilares Estrategicos", 2),
                ("pilares", "Impacto en 4 o mas pilares Estrategicos", 3),
                # Mejoras en procesos
                ("procesos", "Mejoras en 1 eje", 0),
                ("procesos", "Mejoras en 2 ejes incluyendo crecimiento y/o consolidacion de nuevos negocios", 1),
                ("procesos", "Mejoras en 3 ejes", 2),
                ("procesos", "Mejoras en 4 o mas ejes", 3),
                # Usuarios impactados
                ("usuarios_impactados", "Volumetria S <19% de usuarios impactados y/o clientes", 0),
                ("usuarios_impactados", "Volumetria M 20%-49% de usuarios y/o clientes", 1),
                ("usuarios_impactados", "Volumetria L 50%-74% de usuarios y/o clientes", 2),
                ("usuarios_impactados", "Volumetria XL >75% de usuarios y/o clientes", 3),
                # Riesgo operacional
                ("riesgo", "No reduce riesgo operacional", 0),
                ("riesgo", "Riesgo en la continuidad de servicios y generacion de sobrecostos de soporte tecnologico", 1),
                ("riesgo", "Riesgo moderado con impacto en procesos internos", 2),
                ("riesgo", "Riesgo alto con impacto en clientes", 3),
            ]
            for cat_type, name, idx in catalogs:
                db.add(DemandCatalog(catalog_type=cat_type, name=name, order_index=idx))

        await db.commit()

    # Auto-seed service configs from env vars (only if not already in DB)
    # This ensures Gemini/Deepgram/ElevenLabs work on first deploy without manual admin setup
    await _seed_service_configs()


async def _seed_service_configs():
    """On startup, if API keys are in environment but NOT in service_configs DB, insert them.
    This runs on every start but only inserts if missing — never overwrites existing DB values."""
    import os
    import logging
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.service_config import ServiceConfig

    _log = logging.getLogger(__name__)

    # Map: (service_name, key_name) -> env var name
    env_map = [
        ("gemini",     "api_key",  "GEMINI_API_KEY"),
        ("gemini",     "model",    None),          # default is set in code
        ("deepgram",   "api_key",  "DEEPGRAM_API_KEY"),
        ("deepgram",   "model",    None),          # default nova-3 in code
        ("elevenlabs", "api_key",  "ELEVENLABS_API_KEY"),
        ("elevenlabs", "voice_id", "ELEVENLABS_VOICE_ID"),
        ("groq",       "api_key",  "GROQ_API_KEY"),
    ]

    async with AsyncSessionLocal() as db:
        for service, key_name, env_var in env_map:
            if not env_var:
                continue
            env_val = os.getenv(env_var)
            if not env_val:
                continue
            # Check if already in DB
            result = await db.execute(
                select(ServiceConfig).where(
                    ServiceConfig.service_name == service,
                    ServiceConfig.key_name == key_name,
                )
            )
            existing = result.scalar_one_or_none()
            if existing is None:
                db.add(ServiceConfig(
                    service_name=service,
                    key_name=key_name,
                    key_value=env_val,
                    is_active=True,
                ))
                _log.info(f"Auto-seeded service config: {service}.{key_name} from {env_var}")
        await db.commit()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Sistema integrado de gestión de equipos, proyectos e incidentes",
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ─── Middleware ───────────────────────────────────────────────────────────────

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(projects.router, prefix=API_PREFIX)
app.include_router(tasks.router, prefix=API_PREFIX)
app.include_router(incidents.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)
app.include_router(pomodoro.router, prefix=API_PREFIX)
app.include_router(demands.router, prefix=API_PREFIX)
app.include_router(demand_admin.router, prefix=API_PREFIX)
app.include_router(hechos.router, prefix=API_PREFIX)
app.include_router(premisas.router, prefix=API_PREFIX)
app.include_router(ai_assistant.router, prefix=API_PREFIX)
app.include_router(activities.router, prefix=API_PREFIX)
app.include_router(dashboard_builder.router, prefix=API_PREFIX)
app.include_router(lean_pro.router, prefix=API_PREFIX)
app.include_router(ai_chat.router, prefix=API_PREFIX)
app.include_router(business_plan.router, prefix=API_PREFIX)
app.include_router(bp_financial_ai.router, prefix=API_PREFIX)
app.include_router(executive.router, prefix=API_PREFIX)
app.include_router(voice.router, prefix=API_PREFIX)
app.include_router(reminders.router, prefix=API_PREFIX)


# force redeploy 2026-04-11
@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}
