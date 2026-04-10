"""
Voice Meeting & Transcription module.
Meetings can be solo (ARIA chat) or group (meeting recorder).
"""
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class MeetingType(str, enum.Enum):
    ARIA_CHAT = "aria_chat"       # one-on-one voice conversation with ARIA
    MEETING = "meeting"            # team meeting recorder


class MeetingStatus(str, enum.Enum):
    RECORDING = "recording"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class VoiceMeeting(Base):
    __tablename__ = "voice_meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)  # short code for multi-user join
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    meeting_type: Mapped[MeetingType] = mapped_column(default=MeetingType.ARIA_CHAT, nullable=False)
    status: Mapped[MeetingStatus] = mapped_column(default=MeetingStatus.RECORDING, nullable=False)

    # Participants: list of user_ids
    participant_ids: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # {"user_ids": [1, 2, 3]}

    # Transcript chunks accumulated
    transcript_chunks: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Full merged transcript
    full_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # AI Analysis (set after finalize)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_action_items: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)   # list of {text, owner, due_date}
    ai_decisions: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)      # list of decisions made
    ai_key_topics: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)     # list of topics
    ai_participants_mentioned: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Duration tracking
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Whisper model used
    whisper_model_used: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Language detected
    language_detected: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # Who started it
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    # ── Context links — keeps every transcription anchored ──
    business_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("businesses.id"), nullable=True, index=True)
    bp_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("business_plans.id"), nullable=True, index=True)
    bp_activity_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("bp_activities.id"), nullable=True, index=True)

    # After finalize, AI-generated action items can be auto-linked to bp_activity
    auto_linked_actions: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # {linked: bool, activity_ids_created: [...]}

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id], lazy="select")
    business: Mapped[Optional["Business"]] = relationship("Business", foreign_keys=[business_id], lazy="select")
    chunks: Mapped[list["TranscriptChunk"]] = relationship(
        "TranscriptChunk",
        back_populates="meeting",
        cascade="all, delete-orphan",
        lazy="select",
        order_by="TranscriptChunk.sequence_num",
    )


class TranscriptChunk(Base):
    """Individual transcribed audio chunk."""
    __tablename__ = "transcript_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(Integer, ForeignKey("voice_meetings.id"), nullable=False, index=True)

    sequence_num: Mapped[int] = mapped_column(Integer, nullable=False)  # chunk order
    speaker_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    speaker_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    text: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    timestamp_in_meeting: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # seconds from start
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    meeting: Mapped["VoiceMeeting"] = relationship("VoiceMeeting", back_populates="chunks", lazy="select")
    speaker: Mapped[Optional["User"]] = relationship("User", foreign_keys=[speaker_id], lazy="select")
