"""
Transcription service — SmartFlow ARIA.

Priority order:
  1. OpenAI Whisper API   (cloud, whisper-1, $0.006/min, ~4000 min/$25)
  2. Groq Whisper API     (cloud, free tier 28,800s/day, ~1-2s latency, 0 RAM on server)
  3. Local faster-whisper (fallback — loads model into RAM, only if no cloud key)

WHY OPENAI FIRST:
  OpenAI whisper-1 is the most reliable cloud STT option. At $0.006/min,
  100k COP (~$25 USD) covers ~4,000 minutes/month — far more than typical usage.
  Groq is kept as a free fallback (28,800 audio seconds/day free tier).
  Local is last resort — Render free tier has 512MB RAM which triggers OOM.
"""
import logging
import os
import asyncio
import tempfile
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Local model cache (only used when cloud not configured) ────────────────────
_whisper_model = None
_loaded_model_size = None


# ─── 1. OPENAI WHISPER (primary: reliable, $0.006/min) ───────────────────────

async def _transcribe_openai_whisper(audio_bytes: bytes, api_key: str, language: str = "es") -> dict:
    """
    Transcribe via OpenAI Whisper API (whisper-1).
    Accepts webm/mp4/wav/mp3 up to 25MB.
    Cost: $0.006/min — ~4000 min for $25 USD/month.
    """
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": ("audio.webm", audio_bytes, "audio/webm")},
                data={
                    "model": "whisper-1",
                    "language": language,
                    "response_format": "verbose_json",
                    "temperature": "0",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "text": data.get("text", "").strip(),
                    "language": data.get("language", language),
                    "confidence": 0.95,
                    "duration": round(float(data.get("duration", 0.0)), 2),
                    "words": [],
                    "error": None,
                    "source": "openai_whisper",
                }
            else:
                return _error_result(language, f"OpenAI {resp.status_code}: {resp.text[:200]}", source="openai_whisper")
    except Exception as e:
        logger.error(f"OpenAI Whisper exception: {e}")
        return _error_result(language, str(e), source="openai_whisper")


# ─── 2. GROQ WHISPER (fallback: free, 28800s/day) ────────────────────────────

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


# ─── 3. LOCAL FASTER-WHISPER (last resort fallback) ──────────────────────────

def _get_local_model(model_size: str = "base"):
    """
    Load local Whisper model on demand.
    NOTE: uses ~350MB RAM for 'base'. Only used when cloud keys not configured.
    """
    global _whisper_model, _loaded_model_size
    if _whisper_model is None or _loaded_model_size != model_size:
        try:
            from faster_whisper import WhisperModel
            logger.info(f"Loading local Whisper model: {model_size} (no cloud key configured)")
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
    openai_api_key: Optional[str] = None,
    groq_api_key: Optional[str] = None,
) -> dict:
    """
    Transcribe audio bytes.
    Priority: 1) OpenAI Whisper ($0.006/min) → 2) Groq (free) → 3) local faster-whisper.

    Args:
        audio_bytes:     raw audio (webm/mp4/wav)
        model_size:      local model size (only used if cloud unavailable)
        language:        ISO 639-1 code, defaults to 'es'
        openai_api_key:  OpenAI API key — primary cloud STT
        groq_api_key:    Groq API key — free fallback cloud STT
    """
    lang = language or "es"

    # ── 1. OpenAI Whisper (primary: reliable, $0.006/min) ───────────────────
    if openai_api_key:
        result = await _transcribe_openai_whisper(audio_bytes, openai_api_key, language=lang)
        if not result.get("error"):
            return result
        logger.warning(f"OpenAI Whisper failed ({result.get('error')}), falling back to Groq")

    # ── 2. Groq Whisper (free fallback) ─────────────────────────────────────
    if groq_api_key:
        result = await _transcribe_groq(audio_bytes, groq_api_key, language=lang)
        if not result.get("error"):
            return result
        logger.warning(f"Groq transcription failed ({result.get('error')}), falling back to local Whisper")

    # ── 3. Local faster-whisper (last resort) ────────────────────────────────
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
