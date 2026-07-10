import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_ws_ticket,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
)
from app.models import RefreshToken, User
from app.schemas.auth import (
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    VerifyRequest,
    WsTicketResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _safety_number() -> str:
    """A fake 60-digit fingerprint, grouped like Signal's safety numbers."""
    digits = "".join(random.choice("0123456789") for _ in range(60))
    return " ".join(digits[i : i + 5] for i in range(0, 60, 5))


async def _issue_tokens(db, user: User) -> TokenResponse:
    raw, token_hash = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_days),
        )
    )
    await db.commit()
    return TokenResponse(
        access_token=create_access_token(user.id), refresh_token=raw
    )


@router.post("/register", response_model=RegisterResponse)
async def register(payload: RegisterRequest, db: DbSession):
    exists = await db.scalar(
        select(User).where(User.username == payload.username)
    )
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Username taken"
        )
    user = User(
        username=payload.username,
        phone=payload.phone,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        safety_number=_safety_number(),
    )
    db.add(user)
    await db.commit()
    # Verification is mocked: any account verifies with the fixed OTP.
    return RegisterResponse(
        username=user.username, otp_hint=settings.fixed_otp
    )


@router.post("/verify", response_model=TokenResponse)
async def verify(payload: VerifyRequest, db: DbSession):
    user = await db.scalar(
        select(User).where(User.username == payload.username)
    )
    if user is None or payload.otp != settings.fixed_otp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or OTP",
        )
    return await _issue_tokens(db, user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: DbSession):
    token_hash = hash_refresh_token(payload.refresh_token)
    row = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    now = datetime.now(timezone.utc)
    if (
        row is None
        or row.revoked_at is not None
        or row.expires_at.replace(tzinfo=timezone.utc) < now
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    # Rotate: revoke the used token, issue a fresh pair.
    row.revoked_at = now
    user = await db.get(User, row.user_id)
    return await _issue_tokens(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, db: DbSession):
    token_hash = hash_refresh_token(payload.refresh_token)
    row = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        await db.commit()


@router.post("/ws-ticket", response_model=WsTicketResponse)
async def ws_ticket(user: CurrentUser):
    # Short-lived, single-use-in-practice token so the browser can authenticate
    # the socket without putting the long-lived JWT in a URL.
    return WsTicketResponse(ticket=create_ws_ticket(user.id))
