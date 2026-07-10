"""WebSocket endpoint: authenticates via a short-lived ticket, then runs a
receive loop dispatching client events. All authorization is re-checked
server-side on every event — the client's claimed conversation_id is never
trusted."""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import SessionLocal
from app.core.security import decode_token
from app.models import Conversation, User
from app.services import conversation_service as convo_svc
from app.services import message_service as msg_svc
from app.ws.registry import registry

router = APIRouter()

HEARTBEAT_SECONDS = 25


async def _broadcast_presence(user_id: int, online: bool, db: AsyncSession):
    """Tell everyone who shares a conversation with this user about presence."""
    from sqlalchemy import select

    from app.models import ConversationMember

    my_convos = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_id
    )
    rows = await db.execute(
        select(ConversationMember.user_id)
        .where(
            ConversationMember.conversation_id.in_(my_convos),
            ConversationMember.user_id != user_id,
        )
        .distinct()
    )
    peers = [r[0] for r in rows.all()]
    await registry.send_to_users(
        peers,
        {
            "type": "presence",
            "user_id": user_id,
            "online": online,
            "at": datetime.now(timezone.utc).isoformat(),
        },
    )


async def _handle_message_send(ws, user: User, data: dict, db: AsyncSession):
    conversation_id = data.get("conversation_id")
    client_id = data.get("client_id")
    body = (data.get("body") or "").strip()
    if not conversation_id or not client_id or not body:
        await ws.send_json({"type": "error", "detail": "Invalid message.send"})
        return

    # Re-check membership on every send; a removed member's stale socket cannot
    # post here.
    convo = await db.get(Conversation, conversation_id)
    if convo is None or not await convo_svc.is_member(
        db, conversation_id, user.id
    ):
        await ws.send_json({"type": "error", "detail": "Not a member"})
        return

    message, created = await msg_svc.create_message(
        db,
        conversation=convo,
        sender_id=user.id,
        client_id=client_id,
        body=body,
        content_type=data.get("content_type", "text"),
        reply_to_id=data.get("reply_to_id"),
    )
    await db.commit()
    await db.refresh(message)

    total_recipients = await msg_svc.recipient_count(db, conversation_id)
    payload = (
        await msg_svc.serialize_message(db, message, total_recipients)
    ).model_dump(mode="json")

    # Ack the sender so it can reconcile the optimistic bubble.
    await ws.send_json(
        {
            "type": "message.ack",
            "client_id": client_id,
            "id": message.id,
            "seq": message.seq,
            "created_at": message.created_at.isoformat(),
        }
    )
    if not created:
        return  # Idempotent retry: don't re-fan-out.

    member_ids = await convo_svc.list_member_ids(db, conversation_id)
    # Deliver to every online recipient and record delivery receipts.
    for uid in member_ids:
        if uid == user.id:
            continue
        if registry.is_online(uid):
            await msg_svc.mark_delivered(db, message, uid)
    await db.commit()

    fanout_ids = [uid for uid in member_ids if uid != user.id]
    await registry.send_to_users(
        fanout_ids, {"type": "message.new", "message": payload}
    )
    # Tell the sender the updated (possibly delivered) receipt state.
    updated = await msg_svc.serialize_message(
        db, message, total_recipients
    )
    await registry.send_to_user(
        user.id,
        {
            "type": "receipt.update",
            "message_id": message.id,
            "conversation_id": conversation_id,
            "receipts": updated.receipts.model_dump(),
        },
    )


async def _handle_typing(user: User, data: dict, db: AsyncSession, start: bool):
    conversation_id = data.get("conversation_id")
    if not conversation_id or not await convo_svc.is_member(
        db, conversation_id, user.id
    ):
        return
    member_ids = await convo_svc.list_member_ids(db, conversation_id)
    await registry.send_to_users(
        [uid for uid in member_ids if uid != user.id],
        {
            "type": "typing",
            "conversation_id": conversation_id,
            "user_id": user.id,
            "is_typing": start,
        },
    )


async def _handle_read(user: User, data: dict, db: AsyncSession):
    conversation_id = data.get("conversation_id")
    up_to_seq = data.get("up_to_seq")
    if not conversation_id or up_to_seq is None:
        return
    if not await convo_svc.is_member(db, conversation_id, user.id):
        return
    changed = await msg_svc.mark_read_up_to(
        db,
        conversation_id=conversation_id,
        user_id=user.id,
        up_to_seq=up_to_seq,
    )
    await db.commit()
    if not changed:
        return
    total_recipients = await msg_svc.recipient_count(db, conversation_id)
    # Notify senders of the newly-read messages so their checks turn blue.
    from app.models import Message

    for mid in changed:
        message = await db.get(Message, mid)
        if message is None:
            continue
        summary = await msg_svc.receipt_summary(db, message, total_recipients)
        await registry.send_to_user(
            message.sender_id,
            {
                "type": "receipt.update",
                "message_id": mid,
                "conversation_id": conversation_id,
                "reader_id": user.id,
                "receipts": summary.model_dump(),
            },
        )


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, ticket: str):
    user_id = decode_token(ticket, "ws")
    if user_id is None:
        await ws.close(code=4401)
        return
    await ws.accept()

    async with SessionLocal() as db:
        user = await db.get(User, user_id)
        if user is None:
            await ws.close(code=4401)
            return
        user.last_seen_at = datetime.now(timezone.utc)
        await db.commit()

    await registry.add(user_id, ws)
    async with SessionLocal() as db:
        await _broadcast_presence(user_id, True, db)

    async def heartbeat():
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_SECONDS)
                await ws.send_json({"type": "ping"})
        except Exception:
            pass

    hb_task = asyncio.create_task(heartbeat())

    try:
        while True:
            data = await ws.receive_json()
            event = data.get("type")
            async with SessionLocal() as db:
                user = await db.get(User, user_id)
                if event == "message.send":
                    await _handle_message_send(ws, user, data, db)
                elif event == "typing.start":
                    await _handle_typing(user, data, db, start=True)
                elif event == "typing.stop":
                    await _handle_typing(user, data, db, start=False)
                elif event == "receipt.read":
                    await _handle_read(user, data, db)
                elif event == "pong":
                    pass
                elif event == "ping":
                    await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hb_task.cancel()
        await registry.remove(user_id, ws)
        async with SessionLocal() as db:
            u = await db.get(User, user_id)
            if u is not None:
                u.last_seen_at = datetime.now(timezone.utc)
                await db.commit()
            if not registry.is_online(user_id):
                await _broadcast_presence(user_id, False, db)
