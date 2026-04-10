"""
ElevenLabs TTS service — upgraded for SmartFlow ARIA (April 2026).
Supports:
  - HTTP non-streaming TTS (full audio, current behavior)
  - HTTP streaming TTS (chunked, for FastAPI StreamingResponse)
  - WebSocket streaming TTS (ultra-low latency, ~75 ms TTFB)
  - Speech-to-Speech voice conversion
  - Sound effects generation
  - Voice listing with search
  - Instant Voice Cloning (IVC) helper

Model recommendations (as of 2025-2026):
  eleven_flash_v2_5    → ~75 ms latency, 32 langs, 50 % cheaper — USE FOR ARIA REAL-TIME
  eleven_multilingual_v2 → highest quality, 29 langs — USE FOR RECORDINGS / HIGH-FIDELITY
  eleven_v3            → most expressive, 70+ langs, audio tags — USE FOR RICH CONTENT

Best Colombian-Spanish voices for ARIA (business AI persona):
  Clau        SplyIQAjgy4DKGAnOrHi  — professional Bogotá female, educational/instructional
  Natalia     oK6mHoBJSrcLlTyeOykK  — vibrant, elegant, warm cadence (professional narration)
  Sofía       b2htR0pMe28pYwCY9gnP  — warm Medellín female, conversational
  Lina        VmejBeYhbrcTPwDniox7  — natural young Colombian female
  Alisson     SmgKjOvC1aIujLWcMzqq  — warm Colombian accent, neutral pitch
  Sarah*      EXAVITQu4vr4xnSDxMaL  — ElevenLabs premade (American, current default)
  (* replace with a Colombian voice for authentic ARIA persona)
"""
import asyncio
import base64
import json
import logging
from typing import AsyncIterator, Optional

import httpx

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

ELEVENLABS_BASE_URL = "https://api.elevenlabs.io"
ELEVENLABS_WS_URL = "wss://api.elevenlabs.io"

# Model IDs
MODEL_FLASH_V2_5 = "eleven_flash_v2_5"        # ~75 ms latency — RECOMMENDED FOR ARIA
MODEL_MULTILINGUAL_V2 = "eleven_multilingual_v2"  # best quality Spanish
MODEL_V3 = "eleven_v3"                         # most expressive, audio tags, 70+ langs
MODEL_TURBO_V2_5 = "eleven_turbo_v2_5"        # deprecated in favor of flash_v2_5
MODEL_STS_MULTILINGUAL = "eleven_multilingual_sts_v2"  # speech-to-speech

# Output formats
# PCM formats are best for real-time pipelines (no decoding overhead)
# MP3 best for file delivery / base64 in JSON responses
OUTPUT_MP3_HIGH = "mp3_44100_128"     # good quality, standard
OUTPUT_MP3_LOW = "mp3_22050_32"       # lower quality, smaller — fast delivery
OUTPUT_PCM_16K = "pcm_16000"          # raw PCM 16 kHz — for telephony / WebRTC
OUTPUT_PCM_22K = "pcm_22050"          # raw PCM 22 kHz
OUTPUT_PCM_24K = "pcm_24000"          # raw PCM 24 kHz — good balance
OUTPUT_OPUS_HIGH = "opus_48000_128"   # Opus, great for streaming over web

# Voice catalog — Colombian/professional Spanish voices + fallbacks
VOICE_CATALOG = {
    # Colombian professional voices (recommended for ARIA)
    "clau": "SplyIQAjgy4DKGAnOrHi",           # Bogotá, professional, educational
    "natalia": "oK6mHoBJSrcLlTyeOykK",        # vibrant, elegant, warm cadence
    "sofia": "b2htR0pMe28pYwCY9gnP",           # Medellín, warm, conversational
    "lina": "VmejBeYhbrcTPwDniox7",            # natural young Colombian female
    "alisson": "SmgKjOvC1aIujLWcMzqq",        # warm Colombian accent
    # ElevenLabs premade fallbacks
    "sarah": "EXAVITQu4vr4xnSDxMaL",          # current ARIA default (American)
    "aria_premade": "9BWtsMINqrJLrRacOk9x",   # ElevenLabs "Aria" — expressive AI persona
    "roger": "CwhRBWXzGAHq8TQ4Fs17",          # deep male
    "matilda": "XrExE9yKIg1WjnnlVkGX",        # warm female
}

# Default ARIA voice — change to a Colombian voice for authentic persona
DEFAULT_VOICE_ID = "SplyIQAjgy4DKGAnOrHi"     # Clau — Bogotá professional female
DEFAULT_MODEL = MODEL_FLASH_V2_5               # ultra-low latency for real-time


# ─── Default voice settings for ARIA ─────────────────────────────────────────

ARIA_VOICE_SETTINGS = {
    "stability": 0.55,         # slight variation for natural delivery
    "similarity_boost": 0.80,  # high voice fidelity
    "style": 0.25,             # moderate expressiveness (not robotic, not over-acted)
    "use_speaker_boost": True, # enhances speaker clarity
    "speed": 1.0,              # normal pace (0.7–1.2 range)
}


# ─── 1. NON-STREAMING TTS (current behavior, full audio bytes) ────────────────

async def text_to_speech(
    text: str,
    api_key: str,
    voice_id: str = DEFAULT_VOICE_ID,
    model_id: str = DEFAULT_MODEL,
    stability: float = ARIA_VOICE_SETTINGS["stability"],
    similarity_boost: float = ARIA_VOICE_SETTINGS["similarity_boost"],
    style: float = ARIA_VOICE_SETTINGS["style"],
    speed: float = ARIA_VOICE_SETTINGS["speed"],
    output_format: str = OUTPUT_MP3_HIGH,
    optimize_streaming_latency: int = 3,
) -> Optional[bytes]:
    """
    Convert text to speech. Returns full audio bytes (MP3 by default) or None.

    optimize_streaming_latency (0-4):
      0 = no optimization (default)
      1 = ~50 % improvement
      2 = ~75 % improvement
      3 = max optimization
      4 = max + text normalizer off (fastest, may affect pronunciation)

    Recommended:
      - ARIA real-time: model=eleven_flash_v2_5, optimize_streaming_latency=3
      - High-fidelity content: model=eleven_multilingual_v2, optimize_streaming_latency=0
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{ELEVENLABS_BASE_URL}/v1/text-to-speech/{voice_id}"
                f"?output_format={output_format}"
                f"&optimize_streaming_latency={optimize_streaming_latency}",
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
                        "speed": speed,
                    },
                },
            )
            if resp.status_code == 200:
                return resp.content
            else:
                logger.error(f"ElevenLabs TTS error {resp.status_code}: {resp.text[:300]}")
                return None
    except Exception as e:
        logger.error(f"ElevenLabs TTS exception: {e}")
        return None


# ─── 2. HTTP STREAMING TTS (FastAPI StreamingResponse) ────────────────────────

async def text_to_speech_stream(
    text: str,
    api_key: str,
    voice_id: str = DEFAULT_VOICE_ID,
    model_id: str = DEFAULT_MODEL,
    output_format: str = OUTPUT_MP3_HIGH,
    optimize_streaming_latency: int = 3,
    stability: float = ARIA_VOICE_SETTINGS["stability"],
    similarity_boost: float = ARIA_VOICE_SETTINGS["similarity_boost"],
    style: float = ARIA_VOICE_SETTINGS["style"],
    speed: float = ARIA_VOICE_SETTINGS["speed"],
    chunk_size: int = 4096,
) -> AsyncIterator[bytes]:
    """
    Async generator that streams audio bytes as they arrive from ElevenLabs.

    Use with FastAPI StreamingResponse for real-time audio delivery to the browser:

        from fastapi.responses import StreamingResponse
        from app.services.elevenlabs_service import text_to_speech_stream

        @router.post("/tts/stream")
        async def tts_stream(body: TTSBody, db: DB, user: CurrentUser):
            api_key = await get_service_config_value(db, "elevenlabs", "api_key")
            return StreamingResponse(
                text_to_speech_stream(body.text, api_key),
                media_type="audio/mpeg",
                headers={"X-Accel-Buffering": "no"},  # disable nginx buffering
            )

    PCM format tip: use output_format="pcm_16000" for Web Audio API pipelines
    (no MP3 decoder needed, lowest latency to first audible sample).
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"{ELEVENLABS_BASE_URL}/v1/text-to-speech/{voice_id}/stream"
            f"?output_format={output_format}"
            f"&optimize_streaming_latency={optimize_streaming_latency}",
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
                    "speed": speed,
                },
            },
        ) as response:
            if response.status_code != 200:
                body_text = await response.aread()
                logger.error(
                    f"ElevenLabs stream error {response.status_code}: {body_text[:200]}"
                )
                return

            async for chunk in response.aiter_bytes(chunk_size=chunk_size):
                if chunk:
                    yield chunk


# ─── 3. WEBSOCKET STREAMING TTS (ultra-low latency, ~75 ms TTFB) ─────────────

async def text_to_speech_websocket(
    text: str,
    api_key: str,
    voice_id: str = DEFAULT_VOICE_ID,
    model_id: str = MODEL_FLASH_V2_5,
    output_format: str = OUTPUT_MP3_HIGH,
    stability: float = ARIA_VOICE_SETTINGS["stability"],
    similarity_boost: float = ARIA_VOICE_SETTINGS["similarity_boost"],
    chunk_length_schedule: Optional[list] = None,
) -> bytes:
    """
    Stream TTS via WebSocket and collect all audio bytes.
    WebSocket streaming achieves ~75 ms time-to-first-byte with eleven_flash_v2_5.

    chunk_length_schedule controls when audio generation starts based on buffered
    character count. Example [120, 160, 250, 290] means: generate audio after 120
    chars, then after 160 more, etc. Lower first value = lower latency, less coherent.

    Returns: complete audio bytes (all chunks concatenated).

    For true real-time playback, iterate websocket frames directly instead of
    collecting — see text_to_speech_websocket_stream() below.
    """
    try:
        import websockets  # pip install websockets
    except ImportError:
        logger.error("websockets package not installed. Run: pip install websockets")
        return b""

    if chunk_length_schedule is None:
        chunk_length_schedule = [120, 160, 250, 290]

    uri = (
        f"{ELEVENLABS_WS_URL}/v1/text-to-speech/{voice_id}/stream-input"
        f"?model_id={model_id}&output_format={output_format}"
    )

    audio_chunks: list[bytes] = []

    try:
        async with websockets.connect(
            uri,
            additional_headers={"xi-api-key": api_key},
        ) as ws:
            # Initialize connection with voice settings
            await ws.send(json.dumps({
                "text": " ",
                "voice_settings": {
                    "stability": stability,
                    "similarity_boost": similarity_boost,
                    "use_speaker_boost": True,
                },
                "generation_config": {
                    "chunk_length_schedule": chunk_length_schedule,
                },
                "xi_api_key": api_key,
            }))

            # Send text
            await ws.send(json.dumps({"text": text, "flush": True}))

            # Close stream signal
            await ws.send(json.dumps({"text": ""}))

            # Collect audio frames
            async for message in ws:
                data = json.loads(message)
                if data.get("audio"):
                    audio_chunks.append(base64.b64decode(data["audio"]))
                if data.get("isFinal"):
                    break

    except Exception as e:
        logger.error(f"ElevenLabs WebSocket error: {e}")
        return b""

    return b"".join(audio_chunks)


async def text_to_speech_websocket_stream(
    text: str,
    api_key: str,
    voice_id: str = DEFAULT_VOICE_ID,
    model_id: str = MODEL_FLASH_V2_5,
    output_format: str = OUTPUT_MP3_HIGH,
    stability: float = ARIA_VOICE_SETTINGS["stability"],
    similarity_boost: float = ARIA_VOICE_SETTINGS["similarity_boost"],
    chunk_length_schedule: Optional[list] = None,
) -> AsyncIterator[bytes]:
    """
    WebSocket TTS as async generator — yields decoded audio chunks as they arrive.
    Lowest possible latency. Use this for real-time playback pipelines.

    FastAPI usage:
        @router.post("/tts/ws-stream")
        async def tts_ws_stream(body: TTSBody, db: DB, user: CurrentUser):
            api_key = await get_service_config_value(db, "elevenlabs", "api_key")
            return StreamingResponse(
                text_to_speech_websocket_stream(body.text, api_key),
                media_type="audio/mpeg",
                headers={"X-Accel-Buffering": "no"},
            )
    """
    try:
        import websockets
    except ImportError:
        logger.error("websockets package not installed. Run: pip install websockets")
        return

    if chunk_length_schedule is None:
        chunk_length_schedule = [120, 160, 250, 290]

    uri = (
        f"{ELEVENLABS_WS_URL}/v1/text-to-speech/{voice_id}/stream-input"
        f"?model_id={model_id}&output_format={output_format}"
    )

    try:
        async with websockets.connect(
            uri,
            additional_headers={"xi-api-key": api_key},
        ) as ws:
            await ws.send(json.dumps({
                "text": " ",
                "voice_settings": {
                    "stability": stability,
                    "similarity_boost": similarity_boost,
                    "use_speaker_boost": True,
                },
                "generation_config": {
                    "chunk_length_schedule": chunk_length_schedule,
                },
                "xi_api_key": api_key,
            }))

            await ws.send(json.dumps({"text": text, "flush": True}))
            await ws.send(json.dumps({"text": ""}))

            async for message in ws:
                data = json.loads(message)
                if data.get("audio"):
                    yield base64.b64decode(data["audio"])
                if data.get("isFinal"):
                    break

    except Exception as e:
        logger.error(f"ElevenLabs WebSocket stream error: {e}")


# ─── 4. SPEECH-TO-SPEECH (voice conversion) ──────────────────────────────────

async def speech_to_speech(
    audio_bytes: bytes,
    api_key: str,
    target_voice_id: str = DEFAULT_VOICE_ID,
    model_id: str = MODEL_STS_MULTILINGUAL,
    output_format: str = OUTPUT_MP3_HIGH,
    remove_background_noise: bool = False,
    stability: float = 0.5,
    similarity_boost: float = 0.80,
) -> Optional[bytes]:
    """
    Convert audio from one voice to a target ElevenLabs voice while preserving
    the emotion, timing, and delivery of the original.

    Use cases for ARIA:
      - User records themselves → convert to ARIA's voice
      - Echo mitigation with voice identity preservation
      - Voice branding for meetings

    Supported STS models:
      eleven_english_sts_v2        (English only)
      eleven_multilingual_sts_v2   (multilingual — use for Spanish)

    audio_bytes: WAV/MP3/M4A/WEBM audio bytes (user's voice)
    Returns: converted audio bytes in target voice, or None on error.
    """
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{ELEVENLABS_BASE_URL}/v1/speech-to-speech/{target_voice_id}"
                f"?output_format={output_format}",
                headers={"xi-api-key": api_key},
                data={
                    "model_id": model_id,
                    "remove_background_noise": str(remove_background_noise).lower(),
                    "voice_settings": json.dumps({
                        "stability": stability,
                        "similarity_boost": similarity_boost,
                    }),
                },
                files={"audio": ("audio.webm", audio_bytes, "audio/webm")},
            )
            if resp.status_code == 200:
                return resp.content
            else:
                logger.error(f"ElevenLabs STS error {resp.status_code}: {resp.text[:300]}")
                return None
    except Exception as e:
        logger.error(f"ElevenLabs STS exception: {e}")
        return None


# ─── 5. SOUND EFFECTS GENERATION ─────────────────────────────────────────────

async def generate_sound_effect(
    prompt: str,
    api_key: str,
    duration_seconds: float = 3.0,
    prompt_influence: float = 0.3,
    output_format: str = OUTPUT_MP3_HIGH,
    loop: bool = False,
) -> Optional[bytes]:
    """
    Generate a sound effect from a text description.
    Endpoint: POST /v1/sound-generation
    Model: eleven_text_to_sound_v2 (default, supports looping)

    Examples:
      "Soft UI button click notification"
      "Brief success chime, clean and modern"
      "Typing keyboard in quiet office"
      "Subtle alert notification for business app"

    duration_seconds: 0.5–30.0
    prompt_influence: 0.0–1.0 (how strictly to follow prompt; default 0.3)
    loop: creates a seamlessly looping clip (v2 model only)
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{ELEVENLABS_BASE_URL}/v1/sound-generation"
                f"?output_format={output_format}",
                headers={
                    "xi-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "text": prompt,
                    "duration_seconds": duration_seconds,
                    "prompt_influence": prompt_influence,
                    "loop": loop,
                },
            )
            if resp.status_code == 200:
                return resp.content
            else:
                logger.error(f"ElevenLabs sound effect error {resp.status_code}: {resp.text[:200]}")
                return None
    except Exception as e:
        logger.error(f"ElevenLabs sound effect exception: {e}")
        return None


# ─── 6. INSTANT VOICE CLONING (IVC) ──────────────────────────────────────────

async def create_instant_voice_clone(
    name: str,
    audio_bytes: bytes,
    api_key: str,
    audio_filename: str = "sample.mp3",
    description: str = "",
    labels: Optional[dict] = None,
) -> Optional[str]:
    """
    Create an Instant Voice Clone from 1–5 minutes of audio.
    Returns the new voice_id string, or None on failure.

    IVC uses the audio as a conditioning signal at generation time (no fine-tuning).
    Best for quick personalization. For production-grade clones, use PVC (Professional
    Voice Cloning — requires 30+ min audio and manual approval via ElevenLabs portal).

    Usage:
        voice_id = await create_instant_voice_clone(
            name="ARIA-CAS",
            audio_bytes=open("aria_sample.mp3", "rb").read(),
            api_key=api_key,
            description="ARIA voice for SmartFlow CAS assistant",
        )
    """
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            files = {"files": (audio_filename, audio_bytes, "audio/mpeg")}
            data = {"name": name, "description": description}
            if labels:
                data["labels"] = json.dumps(labels)

            resp = await client.post(
                f"{ELEVENLABS_BASE_URL}/v1/voices/add",
                headers={"xi-api-key": api_key},
                data=data,
                files=files,
            )
            if resp.status_code == 200:
                result = resp.json()
                voice_id = result.get("voice_id")
                logger.info(f"IVC created: {name} → voice_id={voice_id}")
                return voice_id
            else:
                logger.error(f"IVC error {resp.status_code}: {resp.text[:300]}")
                return None
    except Exception as e:
        logger.error(f"IVC exception: {e}")
        return None


# ─── 7. VOICE LISTING ─────────────────────────────────────────────────────────

async def get_voices(api_key: str) -> list:
    """List all available ElevenLabs voices (own + shared)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE_URL}/v1/voices",
                headers={"xi-api-key": api_key},
            )
            if resp.status_code == 200:
                data = resp.json()
                return [
                    {
                        "voice_id": v["voice_id"],
                        "name": v["name"],
                        "labels": v.get("labels", {}),
                        "category": v.get("category", "premade"),
                        "preview_url": v.get("preview_url"),
                        "description": v.get("description", ""),
                    }
                    for v in data.get("voices", [])
                ]
    except Exception as e:
        logger.error(f"get_voices error: {e}")
    return []


async def get_models(api_key: str) -> list:
    """List all available ElevenLabs models with their capabilities."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE_URL}/v1/models",
                headers={"xi-api-key": api_key},
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.error(f"get_models error: {e}")
    return []


# ─── 8. ELEVEN v3 WITH AUDIO TAGS ────────────────────────────────────────────

async def text_to_speech_v3(
    text: str,
    api_key: str,
    voice_id: str = DEFAULT_VOICE_ID,
    output_format: str = OUTPUT_MP3_HIGH,
    stability: float = 0.55,
    similarity_boost: float = 0.80,
    style: float = 0.30,
    speed: float = 1.0,
) -> Optional[bytes]:
    """
    TTS using eleven_v3 — most expressive model (70+ languages).
    Supports audio tags for emotional direction in brackets, e.g.:

        "[excited] ¡Hola! [whispers] Esto es privado. [laughs] Qué gracioso."

    Available audio tags:
      Emotions:  [excited], [sad], [angry], [happy], [whispers], [laughs],
                 [sighs], [surprised], [fearful], [disgusted]
      Actions:   [clears throat], [coughs], [sneezes], [yawns]
      Pacing:    [pause], [long pause]
      SFX:       [gunshot], [clapping], [explosion]  (experimental)

    NOTE: eleven_v3 has HIGHER latency than flash_v2_5. Do NOT use for real-time
    ARIA conversations. Best for: audiobooks, rich content, announcements, demos.
    """
    return await text_to_speech(
        text=text,
        api_key=api_key,
        voice_id=voice_id,
        model_id=MODEL_V3,
        stability=stability,
        similarity_boost=similarity_boost,
        style=style,
        speed=speed,
        output_format=output_format,
        optimize_streaming_latency=0,  # v3 doesn't benefit from latency optimization
    )


# ─── 9. CONVENIENCE: TTS with auto model selection ───────────────────────────

async def aria_speak(
    text: str,
    api_key: str,
    voice_id: str = DEFAULT_VOICE_ID,
    use_streaming: bool = False,
    language_code: str = "es",
    speed: float = 1.0,
) -> Optional[bytes]:
    """
    High-level ARIA TTS helper. Automatically selects the best model:
      - Short text (< 200 chars): eleven_flash_v2_5 — fastest for conversational responses
      - Long text (>= 200 chars): eleven_multilingual_v2 — better quality for longer speech

    language_code: ISO 639-1 code. 'es' for Spanish (improves pronunciation accuracy).

    Returns audio bytes (MP3) or None.
    """
    model = MODEL_FLASH_V2_5 if len(text) < 200 else MODEL_MULTILINGUAL_V2
    latency_opt = 3 if model == MODEL_FLASH_V2_5 else 1

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            body: dict = {
                "text": text,
                "model_id": model,
                "language_code": language_code or "es",   # always pass — improves pronunciation
                "voice_settings": {
                    "stability": ARIA_VOICE_SETTINGS["stability"],
                    "similarity_boost": ARIA_VOICE_SETTINGS["similarity_boost"],
                    "style": ARIA_VOICE_SETTINGS["style"],
                    "use_speaker_boost": True,
                    "speed": speed,
                },
            }

            resp = await client.post(
                f"{ELEVENLABS_BASE_URL}/v1/text-to-speech/{voice_id}"
                f"?output_format={OUTPUT_MP3_HIGH}"
                f"&optimize_streaming_latency={latency_opt}",
                headers={
                    "xi-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json=body,
            )
            if resp.status_code == 200:
                return resp.content
            else:
                logger.error(f"aria_speak error {resp.status_code}: {resp.text[:200]}")
                return None
    except Exception as e:
        logger.error(f"aria_speak exception: {e}")
        return None
