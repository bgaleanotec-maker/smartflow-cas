from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User, UserRole

security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        )
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
        )
    return user


async def get_admin_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren permisos de administrador",
        )
    return current_user


async def get_leader_or_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role not in [UserRole.ADMIN, UserRole.LEADER]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren permisos de líder o administrador",
        )
    return current_user


async def get_herramientas_or_above(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    allowed = [UserRole.ADMIN, UserRole.LEADER, UserRole.HERRAMIENTAS]
    if current_user.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren permisos de herramientas, líder o administrador",
        )
    return current_user


async def get_directivo_or_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role not in (UserRole.ADMIN, UserRole.DIRECTIVO):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido a directivos y administradores",
        )
    return current_user


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(get_admin_user)]
LeaderOrAdmin = Annotated[User, Depends(get_leader_or_admin)]
HerramientasOrAbove = Annotated[User, Depends(get_herramientas_or_above)]
DirectivoOrAdmin = Annotated[User, Depends(get_directivo_or_admin)]
DB = Annotated[AsyncSession, Depends(get_db)]
