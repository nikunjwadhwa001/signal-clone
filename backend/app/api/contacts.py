from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models import Contact, User
from app.schemas.user import UserPublic
from pydantic import BaseModel

router = APIRouter(prefix="/contacts", tags=["contacts"])


class AddContactRequest(BaseModel):
    contact_user_id: int
    nickname: str | None = None


@router.get("", response_model=list[UserPublic])
async def list_contacts(user: CurrentUser, db: DbSession):
    rows = await db.execute(
        select(User)
        .join(Contact, Contact.contact_user_id == User.id)
        .where(Contact.owner_id == user.id)
    )
    return list(rows.scalars().all())


@router.post("", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def add_contact(
    payload: AddContactRequest, user: CurrentUser, db: DbSession
):
    if payload.contact_user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add yourself",
        )
    target = await db.get(User, payload.contact_user_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    existing = await db.get(Contact, (user.id, payload.contact_user_id))
    if existing is None:
        db.add(
            Contact(
                owner_id=user.id,
                contact_user_id=payload.contact_user_id,
                nickname=payload.nickname,
            )
        )
        await db.commit()
    return target


@router.delete("/{contact_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_user_id: int, user: CurrentUser, db: DbSession
):
    existing = await db.get(Contact, (user.id, contact_user_id))
    if existing is not None:
        await db.delete(existing)
        await db.commit()
