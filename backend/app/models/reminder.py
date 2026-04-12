"""Quick reminders / notes model for SmartFlow mobile."""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, Integer, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Priority: alta / media / baja
    priority: Mapped[str] = mapped_column(String(20), default="media")
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    done_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # Optional: link reminder to a module
    linked_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # incident / demand / bp_activity
    linked_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    user: Mapped["User"] = relationship("User")
