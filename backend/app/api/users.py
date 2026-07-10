import os
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import or_, select

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.models import User
from app.schemas.user import UpdateMeRequest, UserMe, UserPublic

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserMe)
async def get_me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserMe)
async def update_me(payload: UpdateMeRequest, user: CurrentUser, db: DbSession):
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.avatar_url is not None:
        user.avatar_url = payload.avatar_url
    if payload.about is not None:
        user.about = payload.about
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/users/search", response_model=list[UserPublic])
async def search_users(q: str, user: CurrentUser, db: DbSession):
    q = q.strip()
    if not q:
        return []
    like = f"%{q}%"
    rows = await db.execute(
        select(User)
        .where(
            User.id != user.id,
            or_(User.username.ilike(like), User.display_name.ilike(like)),
        )
        .limit(20)
    )
    return list(rows.scalars().all())


@router.post("/me/avatar", response_model=UserMe)
async def upload_avatar(
    user: CurrentUser, db: DbSession, file: UploadFile = File(...)
):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar must be an image",
        )
    data = await file.read()
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large",
        )
    # Never trust the client filename; generate our own.
    ext = os.path.splitext(file.filename or "")[1][:10]
    name = f"avatar_{user.id}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.upload_dir, name)
    with open(path, "wb") as f:
        f.write(data)
    user.avatar_url = f"/uploads/{name}"
    await db.commit()
    await db.refresh(user)
    return user
