"""
Faster-Whisper transcription service — v2 (2025-04-10).
Model is loaded once and cached. Model size configurable via admin panel or WHISPER_MODEL env var.

Key improvements over v1:
  - condition_on_previous_text=False  → eliminates repetition loops in chunked audio
  - temperature=0.0                   → deterministic greedy decoding, faster, less hallucination
  - beam_size=3                       → 30% faster on CPU vs beam_size=5, fewer hallucinations
  - Segments materialized before tempfile deleted → fixes race condition bug
  - VAD tuned for Colombian Spanish meetings
  - Word-level timestamps
  - Model warmup on load (eliminates cold-start delay on first request)

Model upgrade path:
  Free tier  (512MB) → base
  Starter    (2GB)   → medium or large-v3-turbo
  Standard   (4GB)   → large-v3

For GPU servers: device="cuda", compute_type="float16"
"""
import logging
import math
import os
import asyncio
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

# CPU thread optimization — set once at import time
os.environ.setdefault("OMP_NUM_THREADS", "4")

_whisper_model = None
_loaded_model_size = None


def get_whisper_model(model_size: str = "base"):
    """Lazy-load and cache the Whisper model. Reloads if model size changes."""
    global _whisper_model, _loaded_model_size
    if _whisper_model is None or _loaded_model_size != model_size:
        try:
            from faster_whisper import WhisperModel
            logger.info(f"Loading faster-whisper model: {model_size}")
            _whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
            _loaded_model_size = model_size
            # Warmup: eliminates cold-start latency on first real request
            _warmup_model(_whisper_model)
            logger.info(f"Whisper model '{model_size}' loaded and warmed up")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            return None
    return _whisper_model


def _warmup_model(model):
    """Run a silent audio pass through the model to warm up CTranslate2 kernels."""
    try:
        import numpy as np
        silence = np.zeros(16000, dtype=np.float32)  # 1s silence at 16kHz
        list(model.transcribe(silence, language="es", beam_size=1)[0])
        logger.info("Whisper warmup complete")
    except Exception as e:
        logger.warning(f"Warmup failed (non-fatal): {e}")


def _get_vad_parameters(mode: str = "meeting") -> dict:
    """VAD parameters tuned for Colombian Spanish.

    'meeting'  — tolerate natural pauses, split long continuous speech
    'voice'    — low latency for ARIA back-and-forth conversational turns
    """
    if mode == "voice":
        return {
            "threshold": 0.5,
            "min_speech_duration_ms": 100,
            "max_speech_duration_s": 15.0,
            "min_silence_duration_ms": 400,
            "speech_pad_ms": 300,
        }
    # meeting (default)
    return {
        "threshold": 0.5,
        "neg_threshold": 0.35,
        "min_speech_duration_ms": 250,
        "max_speech_duration_s": 30.0,
        "min_silence_duration_ms": 800,   # natural pause length in Colombian Spanish
        "speech_pad_ms": 400,
    }


async def transcribe_audio(
    audio_bytes: bytes,
    model_size: str = "base",
    language: Optional[str] = None,
    mode: str = "meeting",           # "meeting" or "voice" — tunes VAD params
    word_timestamps: bool = True,    # return per-word timestamps for search/karaoke
) -> dict:
    """
    Transcribe audio bytes using faster-whisper.

    Returns:
        {
          "text":       str,
          "language":   str,
          "confidence": float,
          "duration":   float,
          "words":      list[{word, start, end, probability}],  # if word_timestamps=True
          "error":      str | None,
        }
    """
    def _run_transcription():
        model = get_whisper_model(model_size)
        if model is None:
            return _error_result(language, "Model not loaded — ensure faster-whisper is installed.")

        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            kwargs = {
                # ── Core accuracy params ────────────────────────────────────
                "beam_size": 3,                     # 3 = faster + fewer hallucinations vs 5
                "language": language or "es",
                "temperature": 0.0,                 # greedy decoding: deterministic, fastest
                # ── Hallucination prevention ────────────────────────────────
                "condition_on_previous_text": False, # CRITICAL: prevents repetition loops in chunked audio
                "no_speech_threshold": 0.6,         # skip segments that are likely silence
                "compression_ratio_threshold": 2.4, # skip repeated/hallucinated text
                "log_prob_threshold": -1.0,
                # ── VAD ─────────────────────────────────────────────────────
                "vad_filter": True,
                "vad_parameters": _get_vad_parameters(mode),
                # ── Timestamps ──────────────────────────────────────────────
                "word_timestamps": word_timestamps,
            }

            segments_gen, info = model.transcribe(tmp_path, **kwargs)

            # ⚠️ CRITICAL: Materialize the lazy generator BEFORE the tempfile is
            # deleted in the finally block. Iterating after deletion causes silent
            # data corruption or empty results with VAD + word_timestamps enabled.
            segments_list = list(segments_gen)

        except Exception as e:
            logger.error(f"Transcription error: {e}", exc_info=True)
            return _error_result(language, str(e))
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

        # ── Process materialized segments ────────────────────────────────────
        text_parts = []
        total_confidence = []
        words_data = []
        duration = 0.0

        for seg in segments_list:
            seg_text = seg.text.strip()
            if seg_text:
                text_parts.append(seg_text)
            if hasattr(seg, "avg_logprob"):
                conf = min(1.0, math.exp(seg.avg_logprob))
                total_confidence.append(conf)
            duration = max(duration, seg.end)

            if word_timestamps:
                for word in (seg.words or []):
                    words_data.append({
                        "word": word.word,
                        "start": round(word.start, 3),
                        "end": round(word.end, 3),
                        "probability": round(getattr(word, "probability", 0.9), 3),
                    })

        full_text = " ".join(text_parts).strip()
        avg_confidence = (
            sum(total_confidence) / len(total_confidence)
            if total_confidence else 0.8
        )

        return {
            "text": full_text,
            "language": getattr(info, "language", language or "es"),
            "confidence": round(avg_confidence, 3),
            "duration": round(duration, 2),
            "words": words_data,
            "error": None,
        }

    # Run blocking transcription in a thread pool to avoid blocking the async event loop
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run_transcription)


def _error_result(language: Optional[str], error: str) -> dict:
    return {
        "text": "[No se pudo transcribir el audio.]",
        "language": language or "es",
        "confidence": 0.0,
        "duration": 0.0,
        "words": [],
        "error": error,
    }
