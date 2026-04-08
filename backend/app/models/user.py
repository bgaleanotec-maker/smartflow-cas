import enum
from datetime import date, datetime
from typing import Optional, List
from sqlalchemy import (
    String, Boolean, Integer, Date, DateTime, Enum, ForeignKey, Text, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    LEADER = "leader"
    MEMBER = "member"
    NEGOCIO = "negocio"
    HERRAMIENTAS = "herramientas"


class TeamType(str, enum.Enum):
    BO = "BO"
    CAS = "CAS"


class ContractType(str, enum.Enum):
    INDEFINIDO = "indefinido"
    FIJO = "fijo"
    TEMPORAL = "temporal"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.MEMBER, nullable=False)
    team: Mapped[Optional[TeamType]] = mapped_column(Enum(TeamType), nullable=True)

    # Negocio
    main_business_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("businesses.id"), nullable=True
    )
    secondary_business_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("businesses.id"), nullable=True
    )

    # Contrato
    contract_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    contract_type: Mapped[Optional[ContractType]] = mapped_column(
        Enum(ContractType), nullable=True
    )
    contract_renewal_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Estado y meta
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    main_business: Mapped[Optional["Business"]] = relationship(
        "Business", foreign_keys=[main_business_id], lazy="select"
    )
    secondary_business: Mapped[Optional["Business"]] = relationship(
        "Business", foreign_keys=[secondary_business_id], lazy="select"
    )
    created_by: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[created_by_id], remote_side="User.id"
    )

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"
