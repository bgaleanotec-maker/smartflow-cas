from typing import Optional, List
from fastapi import APIRouter, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.core.deps import DB, AdminUser, LeaderOrAdmin, CurrentUser
from app.core.security import get_password_hash, generate_temp_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserListResponse, UserCreateResponse

router = APIRouter(prefix="/users", tags=["Usuarios"])


@router.get("", response_model=List[UserListResponse])
async def list_users(
    db: DB,
    current_user: CurrentUser,
    is_active: Optional[bool] = None,
    role: Optional[UserRole] = None,
    team: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
):
    query = (
        select(User)
        .options(selectinload(User.main_business))
        .offset(skip)
        .limit(limit)
    )
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if role:
        query = query.where(User.role == role)
    if team:
        query = query.where(User.team == team)
    if search:
        query = query.where(
            User.full_name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")
        )

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: DB, admin: LeaderOrAdmin):
    # Check email unique
    existing = await db.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con este correo",
        )

    temp_password = generate_temp_password()
    new_user = User(
        full_name=payload.full_name,
        email=payload.email.lower(),
        phone=payload.phone,
        role=payload.role,
        team=payload.team,
        main_business_id=payload.main_business_id,
        secondary_business_id=payload.secondary_business_id,
        contract_start_date=payload.contract_start_date,
        contract_type=payload.contract_type,
        contract_renewal_date=payload.contract_renewal_date,
        hashed_password=get_password_hash(temp_password),
        must_change_password=True,
        created_by_id=admin.id,
    )
    db.add(new_user)
    await db.flush()

    # Reload with eager-loaded relationships to avoid async lazy-load error
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.main_business),
            selectinload(User.secondary_business),
        )
        .where(User.id == new_user.id)
    )
    new_user = result.scalar_one()

    # Send welcome email (non-blocking — fails silently if not configured)
    from app.core.config import settings as app_settings
    from app.services.email import send_welcome_email
    import asyncio
    asyncio.create_task(send_welcome_email(
        new_user.email, new_user.full_name, temp_password, app_settings.FRONTEND_URL
    ))

    # Always return temp_password so admin can share it manually if email isn't configured
    # Build dict from ORM object + inject temp_password, then validate
    user_dict = {
        "id": new_user.id,
        "full_name": new_user.full_name,
        "email": new_user.email,
        "phone": new_user.phone,
        "role": new_user.role,
        "team": new_user.team,
        "main_business": new_user.main_business,
        "secondary_business": new_user.secondary_business,
        "contract_type": new_user.contract_type,
        "is_active": new_user.is_active,
        "must_change_password": new_user.must_change_password,
        "temp_password": temp_password,
    }
    return UserCreateResponse.model_validate(user_dict)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: DB, current_user: CurrentUser):
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.main_business),
            selectinload(User.secondary_business),
        )
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(user_id: int, payload: UserUpdate, db: DB, admin: LeaderOrAdmin):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    await db.flush()
    # Reload with eager-loaded relationships to avoid async lazy-load error
    result2 = await db.execute(
        select(User)
        .options(
            selectinload(User.main_business),
            selectinload(User.secondary_business),
        )
        .where(User.id == user.id)
    )
    user = result2.scalar_one()
    return user


@router.post("/{user_id}/reset-password", status_code=status.HTTP_200_OK)
async def reset_user_password(user_id: int, db: DB, admin: LeaderOrAdmin):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    temp_password = generate_temp_password()
    user.hashed_password = get_password_hash(temp_password)
    user.must_change_password = True
    await db.flush()

    # Send reset email (non-blocking)
    from app.core.config import settings as app_settings
    from app.services.email import send_password_reset_email
    import asyncio
    asyncio.create_task(send_password_reset_email(
        user.email, user.full_name, temp_password, app_settings.FRONTEND_URL
    ))

    return {"message": "Contraseña reseteada", "temp_password": temp_password}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(user_id: int, db: DB, admin: LeaderOrAdmin):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes desactivar tu propia cuenta",
        )
    user.is_active = False
    await db.flush()
