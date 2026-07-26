"""Flow — diagramas de proceso BPMN 2.0 (prototipado estilo Miro)."""
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, ForeignKey, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Flow(Base):
    __tablename__ = "flows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Asociaciones opcionales
    project_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("projects.id"), nullable=True)
    business_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("businesses.id"), nullable=True)

    # Contenido del diagrama
    bpmn_xml: Mapped[Optional[str]] = mapped_column(Text, nullable=True)     # XML BPMN 2.0 completo
    overlays: Mapped[Optional[str]] = mapped_column(Text, nullable=True)     # JSON: imágenes/iconos por elemento
    thumbnail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)    # SVG en miniatura para la galería

    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    created_by: Mapped["User"] = relationship("User", lazy="select")
    project: Mapped[Optional["Project"]] = relationship("Project", lazy="select")
    business: Mapped[Optional["Business"]] = relationship("Business", lazy="select")

    def __repr__(self):
        return f"<Flow {self.name[:40]}>"


# Forward imports
from app.models.user import User  # noqa: E402
from app.models.project import Project  # noqa: E402
from app.models.business import Business  # noqa: E402
