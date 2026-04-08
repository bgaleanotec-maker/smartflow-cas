from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Text, Integer, UniqueConstraint, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class DemandCatalog(Base):
    __tablename__ = "demand_catalogs"
    __table_args__ = (
        UniqueConstraint("catalog_type", "name", name="uq_catalog_type_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    catalog_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    value: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("demand_catalogs.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    parent: Mapped[Optional["DemandCatalog"]] = relationship(
        "DemandCatalog", remote_side="DemandCatalog.id", lazy="select"
    )

    def __repr__(self):
        return f"<DemandCatalog {self.catalog_type}: {self.name}>"
