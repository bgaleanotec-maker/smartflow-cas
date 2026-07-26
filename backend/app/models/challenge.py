"""Challenge — retos gamificados parametrizables por el admin (tipo hackathon).
UsageEvent — tracking ligero de uso de la aplicación."""
from datetime import date, datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, ForeignKey, DateTime, Date, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)          # "Desafío BI Marketing"
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # en qué consiste
    prize: Mapped[Optional[str]] = mapped_column(String(300), nullable=True) # "Boletas dobles a cine"
    emoji: Mapped[str] = mapped_column(String(10), default="🏆")

    # Métrica del reto: tareas_completadas | puntualidad | racha | libre (evaluación manual)
    metric: Mapped[str] = mapped_column(String(30), default="tareas_completadas")

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)   # el admin lo puede pausar/desplegar

    winner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id], lazy="select")
    winner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[winner_id], lazy="select")


class UsageEvent(Base):
    """Evento ligero de uso: vistas de página / acciones clave (para estadísticas)."""
    __tablename__ = "usage_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(30), default="page_view")  # page_view | action
    path: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)   # /dashboard, /flujos...
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    user: Mapped["User"] = relationship("User", lazy="select")


# Forward imports
from app.models.user import User  # noqa: E402
