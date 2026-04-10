"""
Email service using Resend.
If RESEND_API_KEY is not configured, silently skips sending (logs warning).
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def send_welcome_email(
    to_email: str,
    full_name: str,
    temp_password: str,
    frontend_url: str,
) -> bool:
    """Send welcome email with temporary password. Returns True if sent."""
    from app.core.config import settings

    api_key = settings.RESEND_API_KEY
    if not api_key:
        logger.warning(
            "RESEND_API_KEY not configured — welcome email NOT sent to %s. "
            "Temp password: %s",
            to_email,
            temp_password,
        )
        return False

    try:
        import httpx
        html = f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px;">
          <h1 style="color:#6366f1;font-size:24px;margin-bottom:8px;">¡Bienvenido a SmartFlow!</h1>
          <p>Hola <strong>{full_name}</strong>,</p>
          <p>Tu cuenta ha sido creada. Usa estas credenciales para ingresar:</p>
          <div style="background:#1e293b;border-radius:12px;padding:20px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>Correo:</strong> {to_email}</p>
            <p style="margin:4px 0;"><strong>Contraseña temporal:</strong>
              <code style="background:#334155;padding:2px 8px;border-radius:6px;font-size:16px;">{temp_password}</code>
            </p>
          </div>
          <p>Al ingresar, el sistema te pedirá que cambies tu contraseña.</p>
          <a href="{frontend_url}/login"
             style="display:inline-block;background:#6366f1;color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:bold;margin-top:8px;">
            Ingresar a SmartFlow
          </a>
          <p style="margin-top:24px;color:#64748b;font-size:12px;">
            Si no esperabas este correo, ignóralo.
          </p>
        </div>
        """
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "from": f"{settings.FROM_NAME} <{settings.FROM_EMAIL}>",
                    "to": [to_email],
                    "subject": "¡Bienvenido a SmartFlow! Tus credenciales de acceso",
                    "html": html,
                },
                timeout=10,
            )
            if resp.status_code in (200, 201):
                logger.info("Welcome email sent to %s", to_email)
                return True
            else:
                logger.error("Resend error %s: %s", resp.status_code, resp.text)
                return False
    except Exception as e:
        logger.error("Failed to send welcome email to %s: %s", to_email, e)
        return False


async def send_password_reset_email(
    to_email: str,
    full_name: str,
    temp_password: str,
    frontend_url: str,
) -> bool:
    """Send password reset email with new temporary password."""
    from app.core.config import settings

    api_key = settings.RESEND_API_KEY
    if not api_key:
        logger.warning(
            "RESEND_API_KEY not configured — reset email NOT sent to %s. "
            "Temp password: %s",
            to_email,
            temp_password,
        )
        return False

    try:
        import httpx
        html = f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px;">
          <h1 style="color:#f59e0b;font-size:24px;margin-bottom:8px;">Restablecimiento de contraseña</h1>
          <p>Hola <strong>{full_name}</strong>,</p>
          <p>Tu contraseña ha sido restablecida. Usa estas credenciales:</p>
          <div style="background:#1e293b;border-radius:12px;padding:20px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>Correo:</strong> {to_email}</p>
            <p style="margin:4px 0;"><strong>Contraseña temporal:</strong>
              <code style="background:#334155;padding:2px 8px;border-radius:6px;font-size:16px;">{temp_password}</code>
            </p>
          </div>
          <p>Al ingresar, deberás cambiar tu contraseña.</p>
          <a href="{frontend_url}/login"
             style="display:inline-block;background:#f59e0b;color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:bold;margin-top:8px;">
            Ingresar a SmartFlow
          </a>
        </div>
        """
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "from": f"{settings.FROM_NAME} <{settings.FROM_EMAIL}>",
                    "to": [to_email],
                    "subject": "SmartFlow — Tu contraseña ha sido restablecida",
                    "html": html,
                },
                timeout=10,
            )
            if resp.status_code in (200, 201):
                logger.info("Reset email sent to %s", to_email)
                return True
            else:
                logger.error("Resend error %s: %s", resp.status_code, resp.text)
                return False
    except Exception as e:
        logger.error("Failed to send reset email to %s: %s", to_email, e)
        return False
