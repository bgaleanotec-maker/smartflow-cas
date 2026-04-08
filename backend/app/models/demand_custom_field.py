import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Text, Integer, Enum, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class FieldType(str, enum.Enum):
    TEXT = "text"
    TEXTAREA = "textarea"
    NUMBER = "number"
    DATE = "date"
    SELECT = "select"
    MULTISELECT = "multiselect"
    BOOLEAN = "boolean"
    EMAIL = "email"
    URL = "url"


class DemandCustomField(Base):
    __tablename__ = "demand_custom_fields"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    field_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    field_label: Mapped[str] = mapped_column(String(200), nullable=False)
    field_type: Mapped[FieldType] = mapped_column(Enum(FieldType), nullable=False)
    options: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    section: Mapped[str] = mapped_column(String(50), default="general")
    placeholder: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    help_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self):
        return f"<DemandCustomField {self.field_name}>"
