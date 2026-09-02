"""KeyDate — cronograma de fechas clave del equipo (juntas, comités, liquidaciones)."""
from datetime import date, datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, ForeignKey, DateTime, Date, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class KeyDate(Base):
    __tablename__ = "key_dates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)      # HH:MM
    category: Mapped[str] = mapped_column(String(30), default="otro")          # junta | comite | liquidacion | entrega | capacitacion | otro
    emoji: Mapped[str] = mapped_column(String(10), default="📌")
    repeat_monthly: Mapped[bool] = mapped_column(Boolean, default=False)       # legado — usar recurrence
    # puntual | semanal | quincenal | mensual | bimestral | trimestral | semestral | anual
    recurrence: Mapped[str] = mapped_column(String(20), default="puntual")

    business_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("businesses.id"), nullable=True)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    business: Mapped[Optional["Business"]] = relationship("Business", lazy="select")
    created_by: Mapped["User"] = relationship("User", lazy="select")


from app.models.user import User  # noqa: E402
from app.models.business import Business  # noqa: E402
