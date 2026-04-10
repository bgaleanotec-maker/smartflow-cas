"""
ElevenLabs TTS service.
API key stored in service_config or ELEVENLABS_API_KEY env var.
Maintainability: voice_id configurable per request or via config.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Best voices for Spanish/professional use:
VOICE_CATALOG = {
    "sarah": "EXAVITQu4vr4xnSDxMaL",       # Clear, professional female (default)
    "aria": "9BWtsMINqrJLrRacOk9x",          # Expressive female — great for AI persona
    "roger": "CwhRBWXzGAHq8TQ4Fs17",         # Deep male
    "nicolas": "g5CIjZEefAph4nQFvHAz",        # Spanish male
    "matilda": "XrExE9yKIg1WjnnlVkGX",        # Warm female
}


async def text_to_speech(
    text: str,
    api_key: str,
    voice_id: str = "EXAVITQu4vr4xnSDxMaL",
    model_id: str = "eleven_multilingual_v2",
    stability: float = 0.5,
    similarity_boost: float = 0.8,
    style: float = 0.3,
    speed: float = 1.0,
) -> Optional[bytes]:
    """
    Convert text to speech using ElevenLabs API.
    Returns audio bytes (mp3) or None on error.
    Model: eleven_multilingual_v2 — best for Spanish.
    """
    try:
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": api_key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                json={
                    "text": text,
                    "model_id": model_id,
                    "voice_settings": {
                        "stability": stability,
                        "similarity_boost": similarity_boost,
                        "style": style,
                        "use_speaker_boost": True,
                    },
                },
            )
            if resp.status_code == 200:
                return resp.content
            else:
                logger.error(f"ElevenLabs error {resp.status_code}: {resp.text[:200]}")
                return None
    except Exception as e:
        logger.error(f"ElevenLabs TTS error: {e}")
        return None


async def get_voices(api_key: str) -> list:
    """List available ElevenLabs voices."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers={"xi-api-key": api_key},
            )
            if resp.status_code == 200:
                data = resp.json()
                return [
                    {
                        "voice_id": v["voice_id"],
                        "name": v["name"],
                        "labels": v.get("labels", {}),
                    }
                    for v in data.get("voices", [])
                ]
    except Exception:
        pass
    return []
