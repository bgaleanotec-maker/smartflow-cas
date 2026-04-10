from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Request
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from app.core.deps import DB, CurrentUser
from app.core.security import (
    verify_password, create_access_token, create_refresh_token, decode_token
)
from app.models.user import User
from app.schemas.auth import LoginRequest, Token, TokenRefresh, PasswordChange
from app.schemas.user import UserResponse

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", response_model=Token)
async def login(payload: LoginRequest, db: DB, request: Request):
    result = await db.execute(
        select(User).where(User.email == payload.email.lower())
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta desactivada. Contacta al administrador.",
        )

    # Update last login
    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(last_login=datetime.now(timezone.utc))
    )

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token)
async def refresh_token(payload: TokenRefresh, db: DB):
    token_data = decode_token(payload.refresh_token)

    if not token_data or token_data.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido",
        )

    user_id = token_data.get("sub")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
        )

    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.main_business),
            selectinload(User.secondary_business),
        )
        .where(User.id == current_user.id)
    )
    return result.scalar_one()


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(payload: PasswordChange, current_user: CurrentUser, db: DB):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contraseña actual incorrecta",
        )

    from app.core.security import get_password_hash
    await db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(
            hashed_password=get_password_hash(payload.new_password),
            must_change_password=False,
        )
    )
