from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.database import engine, Base

# Import all models to ensure they're registered before create_all
import app.models  # noqa: F401

from app.routers import auth, users, projects, tasks, incidents, admin, pomodoro, demands, demand_admin, hechos, premisas, ai_assistant, activities, dashboard_builder


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (use Alembic in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed default data
    await seed_defaults()
    yield


async def seed_defaults():
    """Seed initial required data if not present."""
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.core.security import get_password_hash
    from app.models.user import User, UserRole
    from app.models.catalog import Priority, TaskStatus
    from app.models.business import Business

    async with AsyncSessionLocal() as db:
        # Create admin user if none exists
        result = await db.execute(
            select(User).where(User.role == UserRole.ADMIN).limit(1)
        )
        if not result.scalar_one_or_none():
            admin = User(
                full_name="Administrador SmartFlow",
                email="admin@smartflow.app",
                hashed_password=get_password_hash("SmartFlow2024!"),
                role=UserRole.ADMIN,
                must_change_password=True,
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
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
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


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}
