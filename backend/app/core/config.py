from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "SmartFlow"
    VERSION: str = "1.4.0"  # DB migrations + Whisper/ElevenLabs skill upgrades 2026-04-10
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    FRONTEND_URL: str = "http://localhost:5173"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://smartflow:smartflow123@localhost:5432/smartflow_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # JWT — IMPORTANT: always set SECRET_KEY as env var in production.
    # A fixed fallback is used here so tokens survive server restarts in dev.
    # In production (Render) this MUST be overridden with a stable secret.
    SECRET_KEY: str = "dev-only-secret-key-change-in-production-min32ch"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480   # 8 horas
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Email (Resend)
    RESEND_API_KEY: Optional[str] = None
    FROM_EMAIL: str = "noreply@smartflow.app"
    FROM_NAME: str = "SmartFlow"

    # Ultra (WhatsApp)
    ULTRA_API_KEY: Optional[str] = None
    ULTRA_INSTANCE_ID: Optional[str] = None

    # ElevenLabs (TTS)
    ELEVENLABS_API_KEY: Optional[str] = None
    ELEVENLABS_VOICE_ID: str = "EXAVITQu4vr4xnSDxMaL"  # Default: Sarah (clear, professional)

    # Whisper transcription
    WHISPER_MODEL: str = "base"  # base / medium / large-v3 (depends on server RAM)

    # CORS — all known frontend origins
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "https://smartflow.onrender.com",
        "https://smartflow-cas.onrender.com",
        "https://smartflow-casbo.onrender.com",
        "https://smartflow-api.onrender.com",
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()


# Mapeo de (service_name, key_name) -> atributo de Settings para fallback a .env
_ENV_FALLBACK_MAP = {
    ("resend", "api_key"): "RESEND_API_KEY",
    ("resend", "from_email"): "FROM_EMAIL",
    ("resend", "from_name"): "FROM_NAME",
    ("ultra", "api_key"): "ULTRA_API_KEY",
    ("ultra", "instance_id"): "ULTRA_INSTANCE_ID",
    ("elevenlabs", "api_key"): "ELEVENLABS_API_KEY",
    ("elevenlabs", "voice_id"): "ELEVENLABS_VOICE_ID",
    ("elevenlabs", "model"): None,  # defaults to eleven_multilingual_v2 in service
    ("whisper", "model"): "WHISPER_MODEL",
}


async def get_service_config_value(db, service_name: str, key_name: str):
    """Busca config en DB primero, luego fallback a .env."""
    from sqlalchemy import select
    from app.models.service_config import ServiceConfig

    result = await db.execute(
        select(ServiceConfig.key_value).where(
            ServiceConfig.service_name == service_name,
            ServiceConfig.key_name == key_name,
            ServiceConfig.is_active == True,
        )
    )
    db_value = result.scalar_one_or_none()
    if db_value:
        return db_value

    env_attr = _ENV_FALLBACK_MAP.get((service_name, key_name))
    if env_attr:
        return getattr(settings, env_attr, None)

    return None
