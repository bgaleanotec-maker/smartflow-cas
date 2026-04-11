"""
Transcription service — SmartFlow ARIA.

Priority order:
  1. Groq Whisper API  (cloud, free tier 28,800s/day, ~1-2s latency, 0 RAM on server)
  2. Local faster-whisper (fallback — loads model into RAM, only if no Groq key)

WHY GROQ FIRST:
  Render free tier has 512MB RAM. Loading even the 'base' Whisper model uses
  ~350MB which triggers OOM restarts. Groq runs transcription in their cloud
  at no cost (generous free tier) with much lower latency than local cold start.

Groq Whisper API:
  - Endpoint: https://api.groq.com/openai/v1/audio/transcriptions
  - Models: whisper-large-v3-turbo (fastest), whisper-large-v3 (best quality)
  - Free tier: 28,800 audio seconds/day
  - Key: console.groq.com → API Keys (free account)
"""
import logging
import os
import asyncio
import tempfile
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Local model cache (only used when Groq not configured) ─────────────────────
# Deliberately NOT warmed up at startup — load only on first actual request
_whisper_model = None
_loaded_model_size = None


# ─── 1. GROQ WHISPER (cloud, recommended) ────────────────────────────────────

async def _transcribe_groq(
    audio_bytes: bytes,
    api_key: str,
    language: str = "es",
    model: str = "whisper-large-v3-turbo",
) -> dict:
    """
    Transcribe via Groq's hosted Whisper API.
    Accepts webm/mp4/wav/mp3 up to 25MB.
    Returns same dict shape as local transcribe_audio().
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": ("audio.webm", audio_bytes, "audio/webm")},
                data={
                    "model": model,
                    "language": language,
                    "response_format": "verbose_json",
                    "temperature": "0",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                text = data.get("text", "").strip()
                duration = data.get("duration", 0.0)
                detected_lang = data.get("language", language)
                return {
                    "text": text,
                    "language": detected_lang,
                    "confidence": 0.92,   # Groq doesn't return confidence — assume high
                    "duration": round(float(duration), 2),
                    "words": [],
                    "error": None,
                    "source": "groq",
                }
            else:
                err = resp.text[:200]
                logger.error(f"Groq transcription error {resp.status_code}: {err}")
                return _error_result(language, f"Groq {resp.status_code}: {err}", source="groq")
    except Exception as e:
        logger.error(f"Groq transcription exception: {e}")
        return _error_result(language, str(e), source="groq")


# ─── 2. LOCAL FASTER-WHISPER (fallback) ──────────────────────────────────────

def _get_local_model(model_size: str = "base"):
    """
    Load local Whisper model on demand.
    NOTE: uses ~350MB RAM for 'base'. Only used when Groq key not configured.
    """
    global _whisper_model, _loaded_model_size
    if _whisper_model is None or _loaded_model_size != model_size:
        try:
            from faster_whisper import WhisperModel
            logger.info(f"Loading local Whisper model: {model_size} (Groq not configured)")
            _whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
            _loaded_model_size = model_size
            logger.info(f"Local Whisper '{model_size}' ready")
        except Exception as e:
            logger.error(f"Failed to load local Whisper: {e}")
            return None
    return _whisper_model


def _run_local_transcription(audio_bytes: bytes, model_size: str, language: str) -> dict:
    """Synchronous local transcription — run in thread pool."""
    import math
    model = _get_local_model(model_size)
    if model is None:
        return _error_result(language, "Local Whisper model could not be loaded", source="local")

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        segments_gen, info = model.transcribe(
            tmp_path,
            beam_size=3,
            language=language,
            temperature=0.0,
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            compression_ratio_threshold=2.4,
            vad_filter=True,
            vad_parameters={
                "threshold": 0.5,
                "min_speech_duration_ms": 250,
                "max_speech_duration_s": 30.0,
                "min_silence_duration_ms": 800,
                "speech_pad_ms": 400,
            },
            word_timestamps=False,
        )
        segments = list(segments_gen)  # materialize before tempfile deletion
    except Exception as e:
        logger.error(f"Local transcription error: {e}")
        return _error_result(language, str(e), source="local")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    text_parts = []
    confidences = []
    duration = 0.0
    for seg in segments:
        t = seg.text.strip()
        if t:
            text_parts.append(t)
        if hasattr(seg, "avg_logprob"):
            confidences.append(min(1.0, math.exp(seg.avg_logprob)))
        duration = max(duration, seg.end)

    return {
        "text": " ".join(text_parts).strip(),
        "language": getattr(info, "language", language),
        "confidence": round(sum(confidences) / len(confidences), 3) if confidences else 0.8,
        "duration": round(duration, 2),
        "words": [],
        "error": None,
        "source": "local",
    }


# ─── Main entry point ─────────────────────────────────────────────────────────

async def transcribe_audio(
    audio_bytes: bytes,
    model_size: str = "base",
    language: Optional[str] = None,
    mode: str = "meeting",
    word_timestamps: bool = False,
    groq_api_key: Optional[str] = None,
) -> dict:
    """
    Transcribe audio bytes. Tries Groq API first (no RAM, fast, free).
    Falls back to local faster-whisper if Groq key not provided.

    Args:
        audio_bytes:   raw audio (webm/mp4/wav)
        model_size:    local model size (only used if Groq unavailable)
        language:      ISO 639-1 code, defaults to 'es'
        groq_api_key:  Groq API key — pass to use cloud transcription
    """
    lang = language or "es"

    # ── Groq path (preferred: cloud, 0 RAM) ─────────────────────────────────
    if groq_api_key:
        result = await _transcribe_groq(audio_bytes, groq_api_key, language=lang)
        if not result.get("error"):
            return result
        logger.warning("Groq transcription failed, falling back to local Whisper")

    # ── Local path (fallback: needs RAM) ─────────────────────────────────────
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _run_local_transcription, audio_bytes, model_size, lang
    )


def _error_result(language: Optional[str], error: str, source: str = "unknown") -> dict:
    return {
        "text": "",
        "language": language or "es",
        "confidence": 0.0,
        "duration": 0.0,
        "words": [],
        "error": error,
        "source": source,
    }
