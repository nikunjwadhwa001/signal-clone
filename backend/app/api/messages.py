import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.models import Attachment, Conversation, Message, Reaction
from app.schemas.message import (
    MessageOut,
    ReactionRequest,
    SendMessageRequest,
)
from app.services import conversation_service as convo_svc
from app.services import message_service as msg_svc
from app.ws.registry import registry

router = APIRouter(tags=["messages"])


async def _require_member_convo(db, conversation_id: int, user_id: int):
    convo = await db.get(Conversation, conversation_id)
    if convo is None or not await convo_svc.is_member(
        db, conversation_id, user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )
    return convo


@router.post(
    "/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED
)
async def send_message(
    payload: SendMessageRequest, user: CurrentUser, db: DbSession
):
    """REST fallback used when the socket is down; shares create_message with
    the WS path so idempotency and seq allocation stay identical."""
    convo = await _require_member_convo(db, payload.conversation_id, user.id)
    message, created = await msg_svc.create_message(
        db,
        conversation=convo,
        sender_id=user.id,
        client_id=payload.client_id,
        body=payload.body,
        content_type=payload.content_type,
        reply_to_id=payload.reply_to_id,
    )
    await db.commit()
    await db.refresh(message)
    total_recipients = await msg_svc.recipient_count(db, convo.id)
    out = await msg_svc.serialize_message(db, message, total_recipients)

    if created:
        member_ids = await convo_svc.list_member_ids(db, convo.id)
        await registry.send_to_users(
            [uid for uid in member_ids if uid != user.id],
            {"type": "message.new", "message": out.model_dump(mode="json")},
        )
    return out


@router.post("/messages/{message_id}/reactions", response_model=MessageOut)
async def react(
    message_id: int,
    payload: ReactionRequest,
    user: CurrentUser,
    db: DbSession,
):
    message = await db.get(Message, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    await _require_member_convo(db, message.conversation_id, user.id)

    existing = await db.get(Reaction, (message_id, user.id))
    if existing is not None and existing.emoji == payload.emoji:
        await db.delete(existing)  # toggle off
    elif existing is not None:
        existing.emoji = payload.emoji
    else:
        db.add(
            Reaction(message_id=message_id, user_id=user.id, emoji=payload.emoji)
        )
    await db.commit()

    total_recipients = await msg_svc.recipient_count(db, message.conversation_id)
    out = await msg_svc.serialize_message(db, message, total_recipients)
    member_ids = await convo_svc.list_member_ids(db, message.conversation_id)
    await registry.send_to_users(
        member_ids,
        {"type": "reaction.update", "message": out.model_dump(mode="json")},
    )
    return out


@router.delete("/messages/{message_id}", response_model=MessageOut)
async def delete_message(message_id: int, user: CurrentUser, db: DbSession):
    message = await db.get(Message, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.sender_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only delete your own messages",
        )
    # Tombstone rather than hard-delete so replies pointing here don't dangle.
    message.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    total_recipients = await msg_svc.recipient_count(db, message.conversation_id)
    out = await msg_svc.serialize_message(db, message, total_recipients)
    member_ids = await convo_svc.list_member_ids(db, message.conversation_id)
    await registry.send_to_users(
        member_ids,
        {"type": "message.deleted", "message": out.model_dump(mode="json")},
    )
    return out


@router.post("/attachments")
async def upload_attachment(
    user: CurrentUser, db: DbSession, file: UploadFile = File(...)
):
    mime = file.content_type or "application/octet-stream"
    if not any(mime.startswith(p) for p in settings.allowed_mime_list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Disallowed file type: {mime}",
        )
    data = await file.read()
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large",
        )
    ext = os.path.splitext(file.filename or "")[1][:10]
    name = f"att_{user.id}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.upload_dir, name)
    with open(path, "wb") as f:
        f.write(data)
    attachment = Attachment(
        filename=file.filename or name,
        mime=mime,
        size_bytes=len(data),
        storage_path=f"/uploads/{name}",
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return {
        "id": attachment.id,
        "url": attachment.storage_path,
        "filename": attachment.filename,
        "mime": attachment.mime,
        "size_bytes": attachment.size_bytes,
    }
