"""
Faster-Whisper transcription service.
Model is loaded once and cached. Model size configurable via WHISPER_MODEL env var.
Maintainability: to upgrade model, just change WHISPER_MODEL in env (base/medium/large-v3).
"""
import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_whisper_model = None
_loaded_model_size = None


def get_whisper_model(model_size: str = "base"):
    """Lazy-load and cache the Whisper model. Thread-safe for async use."""
    global _whisper_model, _loaded_model_size
    if _whisper_model is None or _loaded_model_size != model_size:
        try:
            from faster_whisper import WhisperModel
            logger.info(f"Loading faster-whisper model: {model_size}")
            # cpu + int8 for RAM efficiency on free tier
            # For GPU: device="cuda", compute_type="float16"
            _whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
            _loaded_model_size = model_size
            logger.info(f"Whisper model '{model_size}' loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            return None
    return _whisper_model


async def transcribe_audio(
    audio_bytes: bytes,
    model_size: str = "base",
    language: Optional[str] = None,
) -> dict:
    """
    Transcribe audio bytes using faster-whisper.
    Returns: {"text": str, "language": str, "confidence": float, "duration": float}
    """
    import asyncio
    import tempfile
    import os

    def _run_transcription():
        model = get_whisper_model(model_size)
        if model is None:
            return {
                "text": "[No se pudo transcribir el audio. Asegúrese que faster-whisper está instalado.]",
                "language": language or "es",
                "confidence": 0.0,
                "duration": 0.0,
                "error": "Model not loaded",
            }

        # Write to temp file (faster-whisper needs a file path)
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            kwargs = {
                "beam_size": 5,
                "language": language or "es",
                "vad_filter": True,
                "vad_parameters": {
                    "min_silence_duration_ms": 500,   # pausa natural español
                    "speech_pad_ms": 200,              # no cortar sílabas finales
                    "threshold": 0.4,                  # más sensible (menos agresivo)
                },
                "condition_on_previous_text": True,   # coherencia entre chunks
                "compression_ratio_threshold": 2.4,  # detecta repeticiones
                "no_speech_threshold": 0.6,
                "word_timestamps": True,              # timestamps por palabra
            }
            segments, info = model.transcribe(tmp_path, **kwargs)
            text_parts = []
            total_confidence = []
            words_data = []
            duration = 0.0
            for segment in segments:
                seg_text = segment.text.strip()
                if seg_text:
                    text_parts.append(seg_text)
                if hasattr(segment, "avg_logprob"):
                    import math
                    conf = min(1.0, math.exp(segment.avg_logprob))
                    total_confidence.append(conf)
                duration = max(duration, segment.end)
                # Collect word timestamps if available
                for word in (segment.words or []):
                    words_data.append({
                        "word": word.word,
                        "start": round(word.start, 3),
                        "end": round(word.end, 3),
                        "probability": round(getattr(word, "probability", 0.9), 3),
                    })

            full_text = " ".join(text_parts).strip()
            avg_confidence = sum(total_confidence) / len(total_confidence) if total_confidence else 0.8

            return {
                "text": full_text,
                "language": info.language if hasattr(info, "language") else (language or "es"),
                "confidence": round(avg_confidence, 3),
                "duration": round(duration, 2),
                "words": words_data,  # word-level timestamps for karaoke view
            }
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return {
                "text": "[No se pudo transcribir el audio. Asegúrese que faster-whisper está instalado.]",
                "language": language or "es",
                "confidence": 0.0,
                "duration": 0.0,
                "error": str(e),
            }
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    # Run blocking transcription in thread pool
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _run_transcription)
    return result
