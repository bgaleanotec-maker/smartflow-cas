"""
Voice AI router — transcription (Whisper), TTS (ElevenLabs), and ARIA voice chat.
Endpoints:
  Meeting management:  POST/GET/DELETE /voice/meetings
  Transcription:       POST /voice/meetings/{id}/transcribe-chunk
  Finalize:            POST /voice/meetings/{id}/finalize
  Join by code:        POST /voice/meetings/join
  TTS:                 POST /voice/tts
  ARIA chat:           POST /voice/aria-chat
  Voices:              GET  /voice/voices
  Team view:           GET  /voice/team-meetings
"""
import base64
import json
import logging
import random
import re
import string
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Response
from pydantic import BaseModel
from sqlalchemy import select, func, or_

from app.core.config import get_service_config_value
from app.core.deps import DB, CurrentUser, LeaderOrAdmin
from app.models.user import UserRole
from app.models.voice_meeting import VoiceMeeting, TranscriptChunk, MeetingType, MeetingStatus

router = APIRouter(prefix="/voice", tags=["Voice AI"])
logger = logging.getLogger(__name__)

# ─── ARIA system prompt ───────────────────────────────────────────────────────

ARIA_VOICE_PROMPT = """Eres ARIA — asistente de voz inteligente de SmartFlow para el equipo CAS de Vanti.

PERSONALIDAD: cálida, directa, profesional. Habla como colega colombiana de confianza. Nunca robótica.

REGLAS DE RESPUESTA:
1. USA SIEMPRE el bloque "=== SmartFlow ===" del contexto para responder. Esos son datos reales del sistema.
2. Responde máximo en 3-4 oraciones cortas pensando en que la respuesta se va a escuchar, no a leer.
3. Menciona máximo 3 ítems de cualquier lista. Si hay más, di "entre otras".
4. Llama al usuario por su primer nombre.
5. NUNCA digas "Soy ARIA" ni te presentes de nuevo después del saludo inicial.
6. Si no encuentras datos en el contexto, dilo honestamente: "No tengo esa información en este momento."
7. Para reuniones diles que las vean en el módulo Reuniones. Para tareas, en BP o Actividades.

COMPORTAMIENTO POR ROL (el rol está en el contexto):
- admin / leader / directivo: responde con visión de equipo completo. Menciona nombres, equipos, métricas globales.
- member / negocio / herramientas: responde solo sobre lo del usuario. No menciones datos de otros miembros.

NUNCA inventes datos. NUNCA repitas la introducción. NUNCA uses listas con viñetas en respuestas de voz."""

# ─── Helpers ─────────────────────────────────────────────────────────────────


def _generate_session_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def _chunk_to_dict(c: TranscriptChunk) -> dict:
    return {
        "id": c.id,
        "sequence_num": c.sequence_num,
        "speaker_id": c.speaker_id,
        "speaker_name": c.speaker_name,
        "text": c.text,
        "confidence": c.confidence,
        "language": c.language,
        "duration_seconds": c.duration_seconds,
        "timestamp_in_meeting": c.timestamp_in_meeting,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _meeting_to_dict(m: VoiceMeeting) -> dict:
    return {
        "id": m.id,
        "session_code": m.session_code,
        "title": m.title,
        "meeting_type": m.meeting_type.value,
        "status": m.status.value,
        "participant_ids": m.participant_ids,
        "full_transcript": m.full_transcript,
        "ai_summary": m.ai_summary,
        "ai_action_items": m.ai_action_items,
        "ai_decisions": m.ai_decisions,
        "ai_key_topics": m.ai_key_topics,
        "ai_participants_mentioned": m.ai_participants_mentioned,
        "started_at": m.started_at.isoformat() if m.started_at else None,
        "ended_at": m.ended_at.isoformat() if m.ended_at else None,
        "duration_seconds": m.duration_seconds,
        "created_by_id": m.created_by_id,
        "created_by_name": m.created_by.full_name if m.created_by else None,
        "whisper_model_used": m.whisper_model_used,
        "business_id": m.business_id,
        "business_name": m.business.name if m.business else None,
        "business_color": m.business.color if m.business else None,
        "bp_id": m.bp_id,
        "bp_activity_id": m.bp_activity_id,
        "auto_linked_actions": m.auto_linked_actions,
        "chunks": [_chunk_to_dict(c) for c in (m.chunks or [])],
    }


# ─── Context via aria_intelligence service ───────────────────────────────────
# The old cache + build functions have been replaced by the dedicated
# aria_intelligence service which supports intent-aware, role-filtered queries.


async def _call_gemini(api_key: str, model: str, prompt: str, temperature: float = 0.7, max_tokens: int = 512) -> Optional[str]:
    """Call Gemini API and return the text response."""
    # Always use v1beta — it supports all models including legacy ones
    api_version = "v1beta"
    timeout = 25.0 if max_tokens <= 512 else 90.0

    # Normalize model name: upgrade legacy models
    if model in ("gemini-pro", "gemini-1.0-pro", "gemini-1.5-flash", None, ""):
        model = "gemini-2.0-flash"

    # Models to try in order (primary + fallback)
    models_to_try = [model]
    if model != "gemini-2.0-flash":
        models_to_try.append("gemini-2.0-flash")

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            for try_model in models_to_try:
                url = f"https://generativelanguage.googleapis.com/{api_version}/models/{try_model}:generateContent?key={api_key}"
                resp = await client.post(
                    url,
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    text = (
                        data.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                    )
                    if text:
                        logger.info(f"Gemini OK with model={try_model}, {len(text)} chars")
                        return text
                    logger.warning(f"Gemini {try_model} returned empty text, data={str(data)[:200]}")
                else:
                    logger.error(f"Gemini {try_model} error {resp.status_code}: {resp.text[:300]}")
                    # 404 = model not found, try next; other errors may be fatal
                    if resp.status_code not in (404, 400):
                        break
    except httpx.TimeoutException:
        logger.error(f"Gemini timeout after {timeout}s for model={model}")
    except Exception as e:
        logger.error(f"Gemini call error: {e}")
    return None


# ─── Pydantic schemas ─────────────────────────────────────────────────────────


class CreateMeetingBody(BaseModel):
    title: str
    meeting_type: str = "aria_chat"
    business_id: Optional[int] = None   # link to a business (negocio)
    bp_id: Optional[int] = None         # link to a specific BP
    bp_activity_id: Optional[int] = None  # link to a specific BP activity/task


class TTSBody(BaseModel):
    text: str
    voice_id: Optional[str] = None


class AriaChatBody(BaseModel):
    text: str
    meeting_id: Optional[int] = None
    user_name: str
    history: Optional[list] = None   # [{role: "user"|"assistant", content: "..."}]


class JoinMeetingBody(BaseModel):
    session_code: str


class TextChunkBody(BaseModel):
    text: str
    speaker_name: str = ""


# ─── Meeting CRUD ─────────────────────────────────────────────────────────────


@router.post("/meetings")
async def create_meeting(body: CreateMeetingBody, db: DB, user: CurrentUser):
    """Create a new voice meeting session."""
    # Validate meeting_type
    try:
        mtype = MeetingType(body.meeting_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"meeting_type inválido: {body.meeting_type}")

    # Generate unique session code
    for _ in range(10):
        code = _generate_session_code()
        existing = (await db.execute(select(VoiceMeeting).where(VoiceMeeting.session_code == code))).scalar_one_or_none()
        if not existing:
            break

    meeting = VoiceMeeting(
        session_code=code,
        title=body.title,
        meeting_type=mtype,
        status=MeetingStatus.RECORDING,
        created_by_id=user.id,
        business_id=body.business_id,
        bp_id=body.bp_id,
        bp_activity_id=body.bp_activity_id,
        participant_ids={"user_ids": [user.id]},
    )
    db.add(meeting)
    await db.flush()
    await db.refresh(meeting, ["created_by", "chunks", "business"])
    await db.commit()
    return _meeting_to_dict(meeting)


@router.post("/meetings/join")
async def join_meeting(body: JoinMeetingBody, db: DB, user: CurrentUser):
    """Join an existing meeting by session code."""
    meeting = (
        await db.execute(
            select(VoiceMeeting).where(
                VoiceMeeting.session_code == body.session_code.upper(),
                VoiceMeeting.is_deleted == False,
            )
        )
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunión no encontrada con ese código")
    if meeting.status not in (MeetingStatus.RECORDING,):
        raise HTTPException(status_code=400, detail="Esta reunión ya no está activa")

    # Add user to participant_ids if not already there
    pids = meeting.participant_ids or {"user_ids": []}
    if user.id not in pids["user_ids"]:
        pids["user_ids"].append(user.id)
        meeting.participant_ids = pids

    await db.flush()
    await db.refresh(meeting, ["created_by", "chunks"])
    await db.commit()
    return _meeting_to_dict(meeting)


@router.get("/meetings")
async def list_meetings(
    db: DB,
    user: CurrentUser,
    meeting_type: Optional[str] = None,
    status: Optional[str] = None,
    business_id: Optional[int] = None,
    bp_id: Optional[int] = None,
    bp_activity_id: Optional[int] = None,
):
    """List meetings the current user created or participated in, last 50.
    Filterable by business, BP, or BP activity for full context traceability."""
    query = select(VoiceMeeting).where(VoiceMeeting.is_deleted == False)

    # Leaders/admins see all; others only see their own
    if user.role not in (UserRole.ADMIN, UserRole.LEADER, UserRole.DIRECTIVO):
        query = query.where(VoiceMeeting.created_by_id == user.id)

    if meeting_type:
        try:
            query = query.where(VoiceMeeting.meeting_type == MeetingType(meeting_type))
        except ValueError:
            pass
    if status:
        try:
            query = query.where(VoiceMeeting.status == MeetingStatus(status))
        except ValueError:
            pass
    if business_id:
        query = query.where(VoiceMeeting.business_id == business_id)
    if bp_id:
        query = query.where(VoiceMeeting.bp_id == bp_id)
    if bp_activity_id:
        query = query.where(VoiceMeeting.bp_activity_id == bp_activity_id)

    query = query.order_by(VoiceMeeting.started_at.desc()).limit(100)
    meetings = (await db.execute(query)).scalars().all()

    results = []
    for m in meetings:
        await db.refresh(m, ["created_by", "chunks", "business"])
        results.append(_meeting_to_dict(m))
    return results


@router.get("/meetings/by-activity/{activity_id}")
async def meetings_by_activity(activity_id: int, db: DB, user: CurrentUser):
    """All transcriptions linked to a specific BP activity — used in the activity drawer."""
    query = (
        select(VoiceMeeting)
        .where(
            VoiceMeeting.bp_activity_id == activity_id,
            VoiceMeeting.is_deleted == False,
        )
        .order_by(VoiceMeeting.started_at.desc())
    )
    meetings = (await db.execute(query)).scalars().all()
    results = []
    for m in meetings:
        await db.refresh(m, ["created_by", "chunks", "business"])
        results.append(_meeting_to_dict(m))
    return results


@router.get("/meetings/by-business/{business_id}")
async def meetings_by_business(business_id: int, db: DB, user: CurrentUser):
    """All transcriptions linked to a business — for the leader overview."""
    query = (
        select(VoiceMeeting)
        .where(
            VoiceMeeting.business_id == business_id,
            VoiceMeeting.is_deleted == False,
        )
        .order_by(VoiceMeeting.started_at.desc())
        .limit(100)
    )
    meetings = (await db.execute(query)).scalars().all()
    results = []
    for m in meetings:
        await db.refresh(m, ["created_by", "chunks", "business"])
        results.append(_meeting_to_dict(m))
    return results


@router.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: int, db: DB, user: CurrentUser):
    """Get a single meeting with all chunks."""
    meeting = (
        await db.execute(
            select(VoiceMeeting).where(
                VoiceMeeting.id == meeting_id,
                VoiceMeeting.is_deleted == False,
            )
        )
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunión no encontrada")

    # Access check: creator, participant, or admin/leader
    pids = (meeting.participant_ids or {}).get("user_ids", [])
    if meeting.created_by_id != user.id and user.id not in pids and user.role not in (UserRole.ADMIN, UserRole.LEADER):
        raise HTTPException(status_code=403, detail="Sin acceso a esta reunión")

    await db.refresh(meeting, ["created_by", "chunks"])
    return _meeting_to_dict(meeting)


@router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: int, db: DB, user: CurrentUser):
    """Soft-delete a meeting (only creator or admin)."""
    meeting = (
        await db.execute(
            select(VoiceMeeting).where(
                VoiceMeeting.id == meeting_id,
                VoiceMeeting.is_deleted == False,
            )
        )
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunión no encontrada")

    if meeting.created_by_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Solo el creador o admin puede eliminar esta reunión")

    meeting.is_deleted = True
    await db.commit()
    return {"ok": True}


# ─── Transcription ────────────────────────────────────────────────────────────


@router.post("/meetings/{meeting_id}/transcribe-chunk")
async def transcribe_chunk(
    meeting_id: int,
    db: DB,
    user: CurrentUser,
    file: UploadFile = File(...),
):
    """Accept an audio chunk, transcribe with Whisper, store as TranscriptChunk."""
    meeting = (
        await db.execute(
            select(VoiceMeeting).where(
                VoiceMeeting.id == meeting_id,
                VoiceMeeting.is_deleted == False,
            )
        )
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunión no encontrada")

    # Get transcription config — OpenAI (primary) → Groq (fallback) → local Whisper
    openai_key = await get_service_config_value(db, "openai", "api_key")
    groq_api_key = await get_service_config_value(db, "groq", "api_key")
    groq_model = await get_service_config_value(db, "groq", "model") or "whisper-large-v3-turbo"
    model_size = await get_service_config_value(db, "whisper", "model") or "base"

    # Read audio bytes
    audio_bytes = await file.read()

    # Transcribe: OpenAI whisper-1 ($0.006/min) → Groq (free) → local faster-whisper
    from app.services.whisper_service import transcribe_audio
    result = await transcribe_audio(
        audio_bytes,
        model_size=model_size,
        openai_api_key=openai_key,
        groq_api_key=groq_api_key,
    )

    # Determine sequence number
    count_result = await db.execute(
        select(func.count(TranscriptChunk.id)).where(TranscriptChunk.meeting_id == meeting_id)
    )
    seq_num = (count_result.scalar() or 0) + 1

    # Calculate timestamp_in_meeting (approximate, based on when started_at)
    now_utc = datetime.now(timezone.utc)
    if meeting.started_at:
        started = meeting.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        ts_in_meeting = (now_utc - started).total_seconds()
    else:
        ts_in_meeting = None

    # If Whisper returned an error or empty text, skip saving — no noise in transcript
    transcript_text = result.get("text", "") or ""
    if result.get("error") or transcript_text.startswith("["):
        transcript_text = ""

    transcription_source = result.get("source", "unknown")
    transcription_error = result.get("error")

    if not transcript_text.strip():
        # Nothing to save — return info so frontend can surface errors if needed
        return {
            "chunk_id": None,
            "text": "",
            "sequence_num": seq_num,
            "confidence": None,
            "language": None,
            "duration": result.get("duration"),
            "source": transcription_source,
            "error": transcription_error,
        }

    chunk = TranscriptChunk(
        meeting_id=meeting_id,
        sequence_num=seq_num,
        speaker_id=user.id,
        speaker_name=user.full_name,
        text=transcript_text,
        confidence=result.get("confidence"),
        language=result.get("language"),
        duration_seconds=result.get("duration"),
        timestamp_in_meeting=ts_in_meeting,
    )
    db.add(chunk)

    # Update meeting whisper_model_used if not set
    if not meeting.whisper_model_used:
        meeting.whisper_model_used = model_size
    if not meeting.language_detected and result.get("language"):
        meeting.language_detected = result["language"]

    await db.flush()
    await db.commit()

    return {
        "chunk_id": chunk.id,
        "text": chunk.text,
        "sequence_num": chunk.sequence_num,
        "confidence": chunk.confidence,
        "language": chunk.language,
        "duration": chunk.duration_seconds,
        "source": transcription_source,
        "error": None,
    }


@router.post("/meetings/{meeting_id}/add-text-chunk")
async def add_text_chunk(meeting_id: int, body: TextChunkBody, db: DB, user: CurrentUser):
    """
    Save a transcribed text phrase directly (from Web Speech API).
    No audio processing needed — text arrives already transcribed by the browser.
    """
    text = (body.text or "").strip()
    if not text:
        return {"ok": False}

    meeting = (await db.execute(
        select(VoiceMeeting).where(VoiceMeeting.id == meeting_id, VoiceMeeting.is_deleted == False)
    )).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunión no encontrada")

    seq_result = await db.execute(
        select(func.count(TranscriptChunk.id)).where(TranscriptChunk.meeting_id == meeting_id)
    )
    seq_num = (seq_result.scalar() or 0) + 1

    chunk = TranscriptChunk(
        meeting_id=meeting_id,
        sequence_num=seq_num,
        speaker_id=user.id,
        speaker_name=body.speaker_name or user.full_name,
        text=text,
        confidence=0.92,   # Web Speech API typical accuracy
        language="es",
    )
    db.add(chunk)
    await db.flush()
    await db.commit()
    return {"ok": True, "sequence_num": seq_num}


@router.post("/meetings/{meeting_id}/transcribe-complete")
async def transcribe_complete(
    meeting_id: int,
    db: DB,
    user: CurrentUser,
    file: UploadFile = File(...),
):
    """
    Transcribe the complete meeting audio with the best available engine.

    Priority:
      1. Deepgram Nova-3 — diarization (who spoke), noise suppression, Spanish, fast
      2. Groq Whisper — fast cloud, no diarization
      3. Local faster-whisper — fallback, uses RAM

    Returns diarized segments if Deepgram is used:
      [{"speaker_label": "Hablante 1", "text": "Buenos días...", "start": 0.1, "end": 12.3}]
    """
    meeting = (
        await db.execute(
            select(VoiceMeeting).where(
                VoiceMeeting.id == meeting_id,
                VoiceMeeting.is_deleted == False,
            )
        )
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunión no encontrada")

    audio_bytes = await file.read()
    logger.info(f"transcribe-complete: {len(audio_bytes)} bytes, meeting {meeting_id}")

    if len(audio_bytes) < 1000:
        return {"text": "", "segments": [], "chunks": [], "source": "none", "error": "Audio demasiado corto"}

    # ── 1. Deepgram (preferred: diarization + noise + Spanish) ───────────────
    deepgram_key = await get_service_config_value(db, "deepgram", "api_key")
    deepgram_model = await get_service_config_value(db, "deepgram", "model") or "nova-3"

    result = None
    if deepgram_key:
        from app.services.deepgram_service import transcribe_with_deepgram
        result = await transcribe_with_deepgram(
            audio_bytes,
            api_key=deepgram_key,
            model=deepgram_model,
            language="es",
            diarize=True,
        )
        if result.get("error"):
            logger.warning(f"Deepgram failed, falling back: {result['error']}")
            result = None

    # ── 2. OpenAI / Groq Whisper (fallback: fast, no diarization) ──────────
    if not result:
        openai_key = await get_service_config_value(db, "openai", "api_key")
        groq_api_key = await get_service_config_value(db, "groq", "api_key")
        model_size = await get_service_config_value(db, "whisper", "model") or "base"
        from app.services.whisper_service import transcribe_audio
        whisper_result = await transcribe_audio(
            audio_bytes,
            model_size=model_size,
            openai_api_key=openai_key,
            groq_api_key=groq_api_key,
        )
        if not whisper_result.get("error") and whisper_result.get("text"):
            text = whisper_result["text"].strip()
            result = {
                "text": text,
                "diarized_text": text,
                "segments": [],
                "speaker_count": 1,
                "language": whisper_result.get("language", "es"),
                "confidence": whisper_result.get("confidence", 0.8),
                "duration": whisper_result.get("duration", 0.0),
                "source": whisper_result.get("source", "whisper"),
                "error": None,
            }

    if not result or not result.get("text"):
        return {"text": "", "segments": [], "chunks": [], "source": "none", "error": "Sin texto detectado"}

    transcription_source = result["source"]
    segments = result.get("segments", [])  # [{speaker_label, text, start, end}]

    # ── Save diarized chunks to DB (replace Web Speech API preview chunks) ──
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(TranscriptChunk).where(TranscriptChunk.meeting_id == meeting_id))

    saved_chunks = []
    if segments:
        # One chunk per speaker segment
        for i, seg in enumerate(segments):
            chunk = TranscriptChunk(
                meeting_id=meeting_id,
                sequence_num=i + 1,
                speaker_id=user.id,
                speaker_name=seg["speaker_label"],
                text=seg["text"],
                confidence=result.get("confidence"),
                language=result.get("language", "es"),
                duration_seconds=round(seg["end"] - seg["start"], 2),
                timestamp_in_meeting=round(seg["start"], 2),
            )
            db.add(chunk)
            saved_chunks.append(chunk)
    else:
        # Single chunk — no diarization
        chunk = TranscriptChunk(
            meeting_id=meeting_id,
            sequence_num=1,
            speaker_id=user.id,
            speaker_name=user.full_name,
            text=result["text"],
            confidence=result.get("confidence"),
            language=result.get("language", "es"),
            duration_seconds=result.get("duration"),
            timestamp_in_meeting=0,
        )
        db.add(chunk)
        saved_chunks.append(chunk)

    meeting.whisper_model_used = f"{transcription_source}:{deepgram_model if deepgram_key else 'fallback'}"
    if not meeting.language_detected:
        meeting.language_detected = result.get("language", "es")

    await db.flush()
    await db.commit()
    await db.refresh(meeting, ["chunks"])

    logger.info(
        f"transcribe-complete OK: {len(result['text'])} chars, "
        f"{result.get('speaker_count', 1)} hablantes, source={transcription_source}"
    )
    return {
        "text": result["text"],
        "diarized_text": result.get("diarized_text", result["text"]),
        "segments": segments,
        "speaker_count": result.get("speaker_count", 1),
        "source": transcription_source,
        "chunks": [_chunk_to_dict(c) for c in (meeting.chunks or [])],
        "error": None,
    }


@router.post("/meetings/{meeting_id}/finalize")
async def finalize_meeting(meeting_id: int, db: DB, user: CurrentUser):
    """
    End recording: merge chunks into full_transcript,
    call Gemini for AI analysis, set status=COMPLETED.
    """
    meeting = (
        await db.execute(
            select(VoiceMeeting).where(
                VoiceMeeting.id == meeting_id,
                VoiceMeeting.is_deleted == False,
            )
        )
    ).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunión no encontrada")

    if meeting.created_by_id != user.id and user.role not in (UserRole.ADMIN, UserRole.LEADER):
        raise HTTPException(status_code=403, detail="Solo el creador puede finalizar esta reunión")

    # Load chunks in order
    chunks_result = await db.execute(
        select(TranscriptChunk)
        .where(TranscriptChunk.meeting_id == meeting_id)
        .order_by(TranscriptChunk.sequence_num)
    )
    chunks = chunks_result.scalars().all()

    # Build full transcript — skip empty chunks (failed transcriptions)
    transcript_parts = []
    for c in chunks:
        if c.text and c.text.strip():
            speaker = c.speaker_name or "Usuario"
            transcript_parts.append(f"[{speaker}]: {c.text}")
    full_transcript = "\n".join(transcript_parts)

    meeting.full_transcript = full_transcript
    meeting.status = MeetingStatus.PROCESSING

    # Timestamps
    now_utc = datetime.now(timezone.utc)
    meeting.ended_at = now_utc
    if meeting.started_at:
        started = meeting.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        meeting.duration_seconds = int((now_utc - started).total_seconds())

    # Flush basic data so it's staged (but NOT committed yet — single commit at end avoids session expiry)
    await db.flush()

    # AI Analysis via Gemini — wrapped in try/except so it never blocks the response
    try:
        api_key = await get_service_config_value(db, "gemini", "api_key")
        if not api_key:
            logger.warning(f"Gemini analysis skipped for meeting {meeting_id}: no API key configured")
        if api_key and full_transcript.strip():
            model = await get_service_config_value(db, "gemini", "model") or "gemini-2.0-flash"
            logger.info(f"Starting Gemini analysis for meeting {meeting_id}: model={model}, transcript_len={len(full_transcript)}")

            analysis_prompt = f"""Analiza esta transcripción de reunión del equipo CAS de Vanti y responde en JSON válido:
{{
  "summary": "Resumen ejecutivo de 3-4 oraciones",
  "action_items": [{{"text": "...", "owner_mentioned": "...", "priority": "alta/media/baja"}}],
  "decisions": ["decisión 1", "decisión 2"],
  "key_topics": ["tema1", "tema2"],
  "participants_mentioned": ["nombre1", "nombre2"],
  "follow_up_required": true,
  "sentiment": "positivo/neutro/constructivo/tenso"
}}

Transcripción:
{full_transcript}"""

            # Trim transcript to 6000 chars (~1500 tokens) — enough for any meeting, avoids huge bills
            transcript_for_ai = full_transcript[:6000] + ("\n[...transcripción recortada]" if len(full_transcript) > 6000 else "")
            analysis_prompt = analysis_prompt.replace(full_transcript, transcript_for_ai)

            ai_text = await _call_gemini(api_key, model, analysis_prompt, temperature=0.3, max_tokens=900)

            if ai_text:
                # Extract JSON from possible markdown fences
                json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", ai_text, re.DOTALL)
                if json_match:
                    ai_text = json_match.group(1)
                else:
                    json_match = re.search(r"\{.*\}", ai_text, re.DOTALL)
                    if json_match:
                        ai_text = json_match.group(0)
                try:
                    analysis = json.loads(ai_text)
                    meeting.ai_summary = analysis.get("summary")
                    meeting.ai_action_items = analysis.get("action_items")
                    meeting.ai_decisions = analysis.get("decisions")
                    meeting.ai_key_topics = analysis.get("key_topics")
                    meeting.ai_participants_mentioned = analysis.get("participants_mentioned")
                    logger.info(
                        f"Gemini analysis saved for meeting {meeting_id}: "
                        f"summary={bool(meeting.ai_summary)}, "
                        f"action_items={len(meeting.ai_action_items or [])}, "
                        f"decisions={len(meeting.ai_decisions or [])}"
                    )
                except json.JSONDecodeError as jde:
                    logger.warning(f"Gemini JSON parse failed for meeting {meeting_id}: {jde}. Raw: {ai_text[:300]}")
                    meeting.ai_summary = ai_text[:500] if ai_text else None
            else:
                logger.warning(f"Gemini returned no text for meeting {meeting_id}")

            # Auto-link to BP activity
            if meeting.bp_activity_id and meeting.ai_summary:
                from app.models.business_plan import BPComment
                dur_min = meeting.duration_seconds // 60 if meeting.duration_seconds else 0
                db.add(BPComment(
                    activity_id=meeting.bp_activity_id,
                    author_id=meeting.created_by_id,
                    content=(
                        f"📝 **Reunión transcrita:** {meeting.title}\n"
                        f"🕐 Duración: {dur_min} min\n\n"
                        f"**Resumen IA:** {meeting.ai_summary}"
                    ),
                ))
                meeting.auto_linked_actions = {"linked": True, "meeting_comment_added": True}

    except Exception as exc:
        logger.warning(f"Gemini analysis failed for meeting {meeting_id}: {exc}", exc_info=True)
        # Continue — meeting will be saved as completed without AI analysis

    # Single final commit: saves transcript + AI fields + COMPLETED status atomically
    meeting.status = MeetingStatus.COMPLETED
    await db.flush()
    await db.commit()
    # Reload scalar fields + relationships needed by _meeting_to_dict
    await db.refresh(meeting, attribute_names=["ai_summary", "ai_action_items", "ai_decisions",
                                               "ai_key_topics", "ai_participants_mentioned",
                                               "full_transcript", "status", "ended_at",
                                               "duration_seconds", "created_by", "chunks", "business"])
    return _meeting_to_dict(meeting)


# ─── TTS ─────────────────────────────────────────────────────────────────────


@router.post("/tts")
async def text_to_speech_endpoint(body: TTSBody, db: DB, user: CurrentUser):
    """Convert text to ElevenLabs speech, return audio/mpeg."""
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="El texto no puede estar vacío")

    text = body.text[:500]  # Max 500 chars

    api_key = await get_service_config_value(db, "elevenlabs", "api_key")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="ElevenLabs no configurado. Agrega ELEVENLABS_API_KEY en Configuración > Integraciones.",
        )

    voice_id = body.voice_id or await get_service_config_value(db, "elevenlabs", "voice_id") or "SplyIQAjgy4DKGAnOrHi"  # Clau (Colombian professional)

    from app.services.elevenlabs_service import aria_speak
    audio_bytes = await aria_speak(text=text, api_key=api_key, voice_id=voice_id)

    if audio_bytes is None:
        raise HTTPException(status_code=502, detail="Error al generar audio con ElevenLabs")

    return Response(content=audio_bytes, media_type="audio/mpeg")


@router.post("/tts/stream")
async def tts_stream_endpoint(body: TTSBody, db: DB, user: CurrentUser):
    """
    Stream TTS audio as it is generated — browser starts playing immediately.
    ~75 ms time-to-first-byte with eleven_flash_v2_5.
    Use X-Accel-Buffering: no header on Nginx to ensure real-time delivery.
    """
    from fastapi.responses import StreamingResponse as FastAPIStreamingResponse
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="El texto no puede estar vacío")

    api_key = await get_service_config_value(db, "elevenlabs", "api_key")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="ElevenLabs no configurado. Agrega ELEVENLABS_API_KEY en Configuración > Integraciones.",
        )

    voice_id = body.voice_id or await get_service_config_value(db, "elevenlabs", "voice_id") or "SplyIQAjgy4DKGAnOrHi"

    from app.services.elevenlabs_service import text_to_speech_stream
    return FastAPIStreamingResponse(
        text_to_speech_stream(
            text=body.text[:1000],
            api_key=api_key,
            voice_id=voice_id,
            model_id="eleven_flash_v2_5",
            output_format="mp3_44100_128",
            optimize_streaming_latency=3,
        ),
        media_type="audio/mpeg",
        headers={
            "X-Accel-Buffering": "no",      # disable Nginx buffering
            "Cache-Control": "no-cache",
            "Transfer-Encoding": "chunked",
        },
    )


# ─── ARIA Voice Chat ──────────────────────────────────────────────────────────


@router.post("/aria-chat")
async def aria_voice_chat(body: AriaChatBody, db: DB, user: CurrentUser):
    """
    ARIA voice chat cycle:
    1. Load SmartFlow context snapshot (cached 3 min per role)
    2. Build Gemini prompt: system rules + role + context + history + user message
    3. Get Gemini response
    4. Convert to ElevenLabs speech (fallback: browser TTS on client)
    5. Return {response_text, audio_base64}
    """
    is_greeting = body.text.strip() == "saludo_inicial"
    first_name = body.user_name.split()[0] if body.user_name else "equipo"
    role_value = user.role.value if hasattr(user.role, "value") else str(user.role)
    is_leader = user.role in (UserRole.ADMIN, UserRole.LEADER, UserRole.DIRECTIVO)

    # Instruction to Gemini per turn type (must be defined before context call)
    if is_greeting:
        instruction = (
            f"Saluda a {first_name} de forma breve y cálida (1 oración). "
            f"Luego menciona 1-2 datos urgentes o relevantes del contexto: "
            f"actividades vencidas, incidentes abiertos, demandas en evaluación, proyectos por vencer. "
            f"Si todo está al día, dilo con entusiasmo. Máximo 3 oraciones totales."
        )
    else:
        instruction = body.text

    # Context snapshot (intent-aware, cached via aria_intelligence service)
    from app.services.aria_intelligence import get_context as get_aria_context
    smartflow_ctx = await get_aria_context(db, user, instruction if not is_greeting else 'summary')

    # Conversation history (last 6 turns, capped per message to control token cost)
    history_lines = []
    for h in (body.history or [])[-6:]:
        role_label = "ARIA" if h.get("role") == "assistant" else first_name
        history_lines.append(f"{role_label}: {str(h.get('content', ''))[:250]}")
    history_block = ("\n\nHISTORIAL:\n" + "\n".join(history_lines)) if history_lines else ""

    # ── Gemini call ───────────────────────────────────────────────────────────
    gemini_api_key = await get_service_config_value(db, "gemini", "api_key")
    response_text = ""

    if gemini_api_key:
        model = await get_service_config_value(db, "gemini", "model") or "gemini-2.0-flash"
        if model in ("gemini-pro", "gemini-1.0-pro", "gemini-1.5-flash"):
            model = "gemini-2.0-flash"

        full_prompt = (
            f"{ARIA_VOICE_PROMPT}\n\n"
            f"USUARIO: {body.user_name} · ROL: {role_value} · "
            f"VISIBILIDAD: {'equipo completo' if is_leader else 'solo sus datos'}\n\n"
            f"{smartflow_ctx}"
            f"{history_block}\n\n"
            f"TURNO ACTUAL — {first_name} dice: {instruction}"
        )
        # Cap ARIA context to 3000 chars to keep token cost low (~750 tokens context + ~250 response)
        full_prompt_capped = full_prompt[:5000]
        response_text = await _call_gemini(gemini_api_key, model, full_prompt_capped, temperature=0.7, max_tokens=350) or ""

    if not response_text:
        # Fallback: never repeat the intro, never say "Soy ARIA"
        response_text = f"Perdona {first_name}, tuve un problema al conectarme. ¿Puedes repetirlo?"

    # ── Persist to meeting transcript (optional) ──────────────────────────────
    if body.meeting_id and not is_greeting:
        meeting = (await db.execute(
            select(VoiceMeeting).where(
                VoiceMeeting.id == body.meeting_id,
                VoiceMeeting.is_deleted == False,
            )
        )).scalar_one_or_none()

        if meeting:
            seq_result = await db.execute(
                select(func.count(TranscriptChunk.id)).where(TranscriptChunk.meeting_id == body.meeting_id)
            )
            seq_num = (seq_result.scalar() or 0) + 1
            db.add(TranscriptChunk(
                meeting_id=body.meeting_id, sequence_num=seq_num,
                speaker_id=user.id, speaker_name=body.user_name,
                text=body.text, confidence=0.9, language="es",
            ))
            db.add(TranscriptChunk(
                meeting_id=body.meeting_id, sequence_num=seq_num + 1,
                speaker_id=None, speaker_name="ARIA",
                text=response_text, confidence=1.0, language="es",
            ))
            await db.flush()
            await db.commit()

    # ── ElevenLabs TTS ────────────────────────────────────────────────────────
    # Falls back to browser TTS on the client when no key is configured.
    audio_b64 = None
    elevenlabs_key = await get_service_config_value(db, "elevenlabs", "api_key")
    if elevenlabs_key:
        voice_id = await get_service_config_value(db, "elevenlabs", "voice_id") or "UgBBYS2sOqTuMpoF3BR0"
        from app.services.elevenlabs_service import aria_speak
        audio_bytes = await aria_speak(
            text=response_text[:600],
            api_key=elevenlabs_key,
            voice_id=voice_id,
            language_code="es",
        )
        if audio_bytes:
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

    return {
        "response_text": response_text,
        "audio_base64": audio_b64,
        "meeting_id": body.meeting_id,
    }


# ─── ARIA context cache invalidation ─────────────────────────────────────────


@router.post("/aria-context/refresh")
async def refresh_aria_context(db: DB, user: CurrentUser):
    """
    Force a fresh SmartFlow context snapshot for ARIA.
    Call this after bulk data changes (e.g., after a sprint planning session).
    """
    from app.services.aria_intelligence import invalidate_user, get_context as get_aria_context
    invalidate_user(user)
    await get_aria_context(db, user, 'summary')
    return {"ok": True}


# ─── Voices list ─────────────────────────────────────────────────────────────


@router.get("/voices")
async def list_voices(db: DB, user: CurrentUser):
    """List available ElevenLabs voices."""
    api_key = await get_service_config_value(db, "elevenlabs", "api_key")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="ElevenLabs no configurado. Agrega ELEVENLABS_API_KEY en Configuración > Integraciones.",
        )
    from app.services.elevenlabs_service import get_voices
    voices = await get_voices(api_key)
    return voices


# ─── Team meetings (leader/admin view) ───────────────────────────────────────


@router.get("/team-meetings")
async def team_meetings(
    db: DB,
    user: LeaderOrAdmin,
    meeting_type: Optional[str] = None,
    status: Optional[str] = None,
    business_id: Optional[int] = None,
):
    """Leaders/admins: see all team meetings with stats."""
    query = (
        select(VoiceMeeting)
        .where(VoiceMeeting.is_deleted == False)
        .order_by(VoiceMeeting.started_at.desc())
        .limit(100)
    )

    if meeting_type:
        try:
            mtype = MeetingType(meeting_type)
            query = query.where(VoiceMeeting.meeting_type == mtype)
        except ValueError:
            pass

    if status:
        try:
            mstatus = MeetingStatus(status)
            query = query.where(VoiceMeeting.status == mstatus)
        except ValueError:
            pass

    if business_id:
        query = query.where(VoiceMeeting.business_id == business_id)

    meetings = (await db.execute(query)).scalars().all()

    results = []
    for m in meetings:
        await db.refresh(m, ["created_by", "chunks", "business"])
        d = _meeting_to_dict(m)
        # Add stats
        d["participant_count"] = len((m.participant_ids or {}).get("user_ids", []))
        d["chunk_count"] = len(m.chunks or [])
        d["summary_preview"] = (m.ai_summary or "")[:100] if m.ai_summary else None
        d["action_items_count"] = len(m.ai_action_items or []) if m.ai_action_items else 0
        # Trim chunks for list view
        d["chunks"] = []
        results.append(d)

    return results


# ─── Quick transcription (no meeting required — for voice notes) ─────────────

@router.post("/transcribe-quick")
async def transcribe_quick(
    file: UploadFile = File(...),
    language: str = "es",
    db: DB = None,
    current_user: CurrentUser = None,
):
    """
    Transcribe an audio blob without creating a meeting.
    Used by voice notes quick-record flow.
    Returns { text, language, duration, source }
    """
    audio_bytes = await file.read()
    if len(audio_bytes) < 500:
        return {"text": "", "language": language, "duration": 0.0, "source": "empty"}

    openai_key = await get_service_config_value(db, "openai", "api_key")
    groq_key   = await get_service_config_value(db, "groq",   "api_key")

    from app.services.whisper_service import transcribe_audio
    result = await transcribe_audio(
        audio_bytes,
        language=language,
        openai_api_key=openai_key,
        groq_api_key=groq_key,
    )
    return {
        "text":     result.get("text", ""),
        "language": result.get("language", language),
        "duration": result.get("duration", 0.0),
        "source":   result.get("source", "unknown"),
        "error":    result.get("error"),
    }


# ─── Convert transcription to task ───────────────────────────────────────────


@router.post("/transcriptions/{chunk_id}/to-task")
async def transcription_to_task(
    chunk_id: int,
    payload: dict,
    db: DB,
    current_user: CurrentUser,
):
    """
    Convierte una transcripción de voz en una tarea/acción asignable.
    payload: { title, assigned_to_id (opcional), project_id (opcional), due_date (opcional), priority }
    """
    # Buscar el chunk
    chunk = await db.get(TranscriptChunk, chunk_id)
    if not chunk:
        raise HTTPException(status_code=404, detail="Transcripción no encontrada")

    title = payload.get("title") or chunk.text[:100]

    # Crear como acción/tarea — guardar en una tabla genérica o retornar para el frontend
    return {
        "ok": True,
        "task": {
            "title": title,
            "source_transcript": chunk.text,
            "assigned_to_id": payload.get("assigned_to_id"),
            "project_id": payload.get("project_id"),
            "due_date": payload.get("due_date"),
            "priority": payload.get("priority", "media"),
            "created_by_id": current_user.id,
        }
    }
