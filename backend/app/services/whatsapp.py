"""
WhatsApp notification service via UltraMsg API.
Credentials are read from service_configs table (or .env fallback).
Docs: https://docs.ultramsg.com/api/post/messages/chat
"""
import logging
import httpx
from app.core.database import AsyncSessionLocal
from app.core.config import get_service_config_value

logger = logging.getLogger(__name__)


async def _get_ultra_creds() -> tuple[str | None, str | None]:
    """Return (api_key, instance_id) from DB config or env fallback."""
    async with AsyncSessionLocal() as db:
        api_key = await get_service_config_value(db, "ultra", "api_key")
        instance_id = await get_service_config_value(db, "ultra", "instance_id")
    return api_key, instance_id


def _normalize_phone(phone: str) -> str:
    """
    Normalize phone to UltraMsg format: digits only, with country code, no '+'.
    e.g.  +57 322 269 9322  ->  573222699322
    """
    cleaned = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    return cleaned


async def send_whatsapp(phone: str, message: str) -> bool:
    """
    Send a WhatsApp message to a single phone number via UltraMsg.
    Returns True if the API accepted the message, False otherwise.
    Fails silently (logs error) so it never crashes callers.
    """
    if not phone:
        return False

    api_key, instance_id = await _get_ultra_creds()

    if not api_key or not instance_id:
        logger.warning(
            "UltraMsg not configured (ULTRA_API_KEY / ULTRA_INSTANCE_ID missing) "
            "— WhatsApp NOT sent to %s",
            phone,
        )
        return False

    phone_clean = _normalize_phone(phone)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"https://api.ultramsg.com/{instance_id}/messages/chat",
                data={
                    "token": api_key,
                    "to": phone_clean,
                    "body": message,
                    "priority": 1,
                },
            )
            body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            # UltraMsg returns {"sent":"true","message":"..."} on success
            if body.get("sent") == "true" or resp.status_code == 200:
                logger.info("WhatsApp sent to %s", phone_clean)
                return True
            else:
                logger.error("UltraMsg error (status %s): %s", resp.status_code, body)
                return False
    except httpx.TimeoutException:
        logger.error("WhatsApp send timed out for %s", phone_clean)
        return False
    except Exception as exc:
        logger.error("WhatsApp send failed for %s: %s", phone_clean, exc)
        return False
