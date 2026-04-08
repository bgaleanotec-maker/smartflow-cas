from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Text, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class ServiceConfig(Base):
    __tablename__ = "service_configs"
    __table_args__ = (
        UniqueConstraint("service_name", "key_name", name="uq_service_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    service_name: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    key_name: Mapped[str] = mapped_column(String(100), nullable=False)
    key_value: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self):
        return f"<ServiceConfig {self.service_name}.{self.key_name}>"
