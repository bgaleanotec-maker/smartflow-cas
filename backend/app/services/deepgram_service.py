"""
Deepgram Nova-3 transcription service for SmartFlow.

Features used:
  - nova-3 model: best Spanish accuracy + noise robustness
  - diarize=true: identifies who is speaking (Hablante 1, Hablante 2...)
  - punctuate=true: adds punctuation
  - smart_format=true: formats numbers, dates, currencies
  - mip_opt_out=true: Deepgram will NOT use this audio for model training
  - language=es: Spanish (handles Colombian/Latam accent)

Priority order in SmartFlow:
  1. Deepgram (diarization + noise + Spanish) ← PRIMARY
  2. Groq Whisper (fast, free, no diarization) ← FALLBACK
  3. Local faster-whisper (no RAM needed if Groq configured) ← LAST RESORT

Pricing: $200 free credit (no expiry). At 15h/month = ~2 years free.
After that: ~$0.38/hr batch or ~$0.58/hr streaming with diarization.
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen"


def _build_diarized_transcript(words: list) -> list[dict]:
    """
    Group words by speaker into continuous segments.
    Returns list of {speaker_label, text, start, end}.

    Example output:
      [
        {"speaker_label": "Hablante 1", "text": "Buenos días equipo...", "start": 0.1, "end": 12.3},
        {"speaker_label": "Hablante 2", "text": "Hola, como están...", "start": 12.5, "end": 25.0},
      ]
    """
    if not words:
        return []

    segments = []
    current_speaker = None
    current_words = []
    seg_start = 0.0
    seg_end = 0.0

    for w in words:
        speaker = w.get("speaker", 0)
        word_text = w.get("punctuated_word") or w.get("word", "")
        word_start = w.get("start", 0.0)
        word_end = w.get("end", 0.0)

        if speaker != current_speaker:
            if current_words:
                segments.append({
                    "speaker_label": f"Hablante {current_speaker + 1}",
                    "text": " ".join(current_words),
                    "start": seg_start,
                    "end": seg_end,
                })
            current_speaker = speaker
            current_words = [word_text]
            seg_start = word_start
            seg_end = word_end
        else:
            current_words.append(word_text)
            seg_end = word_end

    # Last segment
    if current_words and current_speaker is not None:
        segments.append({
            "speaker_label": f"Hablante {current_speaker + 1}",
            "text": " ".join(current_words),
            "start": seg_start,
            "end": seg_end,
        })

    return segments


async def transcribe_with_deepgram(
    audio_bytes: bytes,
    api_key: str,
    model: str = "nova-3",
    language: str = "es",
    diarize: bool = True,
) -> dict:
    """
    Send audio to Deepgram and return structured transcription.

    Returns:
    {
        "text": "full transcript as plain text",
        "segments": [{"speaker_label": "Hablante 1", "text": "...", "start": 0.0, "end": 5.0}],
        "speaker_count": 2,
        "language": "es",
        "confidence": 0.97,
        "duration": 42.5,
        "source": "deepgram",
        "error": None,
    }
    """
    if not audio_bytes or len(audio_bytes) < 1000:
        return _error_result(language, "Audio demasiado corto")

    params = {
        "model": model,
        "language": language,
        "diarize": "true" if diarize else "false",
        "punctuate": "true",
        "smart_format": "true",
        "mip_opt_out": "true",   # Do NOT train on this audio
        "filler_words": "false", # Remove "um", "eh", etc.
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                DEEPGRAM_API_URL,
                params=params,
                headers={
                    "Authorization": f"Token {api_key}",
                    "Content-Type": "audio/webm",
                },
                content=audio_bytes,
            )

            if resp.status_code != 200:
                err = resp.text[:300]
                logger.error(f"Deepgram error {resp.status_code}: {err}")
                return _error_result(language, f"Deepgram {resp.status_code}: {err}")

            data = resp.json()
            result = data.get("results", {})
            channels = result.get("channels", [{}])
            alt = channels[0].get("alternatives", [{}])[0] if channels else {}

            full_text = alt.get("transcript", "").strip()
            words = alt.get("words", [])
            confidence = alt.get("confidence", 0.0)

            # Metadata
            metadata = data.get("metadata", {})
            duration = metadata.get("duration", 0.0)

            # Build diarized segments
            segments = _build_diarized_transcript(words) if diarize and words else []
            speaker_count = len({s["speaker_label"] for s in segments}) if segments else 1

            # Build diarized plain text (for DB storage)
            if segments:
                diarized_text = "\n".join(
                    f"[{seg['speaker_label']}]: {seg['text']}"
                    for seg in segments
                )
            else:
                diarized_text = full_text

            logger.info(
                f"Deepgram OK: {len(full_text)} chars, "
                f"{speaker_count} hablantes, {duration:.1f}s, "
                f"confianza {confidence:.2f}"
            )

            return {
                "text": full_text,
                "diarized_text": diarized_text,
                "segments": segments,
                "speaker_count": speaker_count,
                "language": language,
                "confidence": round(float(confidence), 3),
                "duration": round(float(duration), 2),
                "source": "deepgram",
                "error": None,
            }

    except httpx.TimeoutException:
        logger.error("Deepgram timeout after 120s")
        return _error_result(language, "Deepgram timeout — audio may be too long")
    except Exception as e:
        logger.error(f"Deepgram exception: {e}")
        return _error_result(language, str(e))


def _error_result(language: str, error: str) -> dict:
    return {
        "text": "",
        "diarized_text": "",
        "segments": [],
        "speaker_count": 0,
        "language": language,
        "confidence": 0.0,
        "duration": 0.0,
        "source": "deepgram",
        "error": error,
    }
