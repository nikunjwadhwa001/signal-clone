"""Core write path for messages. Used by both the REST fallback endpoint and
the WebSocket handler so idempotency and seq allocation live in one place."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Conversation,
    ConversationMember,
    Message,
    MessageReceipt,
    Reaction,
)
from app.schemas.message import (
    MessageOut,
    ReactionOut,
    ReceiptSummary,
)


async def create_message(
    db: AsyncSession,
    *,
    conversation: Conversation,
    sender_id: int,
    client_id: str,
    body: str,
    content_type: str = "text",
    reply_to_id: int | None = None,
) -> tuple[Message, bool]:
    """Insert a message, allocating the next per-conversation seq inside the
    same transaction. Returns (message, created). If a row with the same
    (conversation_id, client_id) already exists, returns it with created=False
    so a retried send is idempotent rather than duplicated.

    Correctness note: seq allocation and insert share one transaction and rely
    on SQLite's single-writer lock, so two concurrent senders can never get the
    same seq.
    """
    existing = await db.execute(
        select(Message).where(
            Message.conversation_id == conversation.id,
            Message.client_id == client_id,
        )
    )
    found = existing.scalars().first()
    if found is not None:
        return found, False

    conversation.last_seq += 1
    seq = conversation.last_seq
    now = datetime.now(timezone.utc)
    expires_at = None
    if conversation.disappearing_seconds > 0:
        expires_at = now + timedelta(seconds=conversation.disappearing_seconds)

    message = Message(
        conversation_id=conversation.id,
        seq=seq,
        sender_id=sender_id,
        client_id=client_id,
        ciphertext=body,
        content_type=content_type,
        reply_to_id=reply_to_id,
        expires_at=expires_at,
    )
    conversation.last_message_at = now
    db.add(message)
    await db.flush()
    return message, True


async def recipient_count(db: AsyncSession, conversation_id: int) -> int:
    total = await db.scalar(
        select(func.count()).select_from(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id
        )
    )
    # Recipients exclude the sender; -1 gives the count that must ack for a
    # message to count as delivered/read to everyone.
    return max((total or 1) - 1, 0)


async def mark_delivered(
    db: AsyncSession, message: Message, user_id: int
) -> None:
    if user_id == message.sender_id:
        return
    receipt = await db.get(MessageReceipt, (message.id, user_id))
    now = datetime.now(timezone.utc)
    if receipt is None:
        db.add(
            MessageReceipt(
                message_id=message.id, user_id=user_id, delivered_at=now
            )
        )
    elif receipt.delivered_at is None:
        receipt.delivered_at = now


async def mark_read_up_to(
    db: AsyncSession,
    *,
    conversation_id: int,
    user_id: int,
    up_to_seq: int,
) -> list[int]:
    """Mark all messages the user received (seq <= up_to_seq, not their own) as
    read, and advance their last_read_seq monotonically. Returns the message
    ids that transitioned to read so the caller can notify senders.
    """
    member = await db.get(ConversationMember, (conversation_id, user_id))
    if member is None:
        return []

    now = datetime.now(timezone.utc)
    rows = await db.execute(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.seq <= up_to_seq,
            Message.seq > member.last_read_seq,
            Message.sender_id != user_id,
        )
    )
    changed: list[int] = []
    for message in rows.scalars().all():
        receipt = await db.get(MessageReceipt, (message.id, user_id))
        if receipt is None:
            db.add(
                MessageReceipt(
                    message_id=message.id,
                    user_id=user_id,
                    delivered_at=now,
                    read_at=now,
                )
            )
            changed.append(message.id)
        elif receipt.read_at is None:
            receipt.delivered_at = receipt.delivered_at or now
            receipt.read_at = now
            changed.append(message.id)

    # Monotonic: never move the pointer backwards on a stale in-flight read.
    if up_to_seq > member.last_read_seq:
        member.last_read_seq = up_to_seq
    return changed


async def receipt_summary(
    db: AsyncSession, message: Message, total_recipients: int
) -> ReceiptSummary:
    delivered = await db.scalar(
        select(func.count()).select_from(MessageReceipt).where(
            MessageReceipt.message_id == message.id,
            MessageReceipt.delivered_at.is_not(None),
        )
    )
    read = await db.scalar(
        select(func.count()).select_from(MessageReceipt).where(
            MessageReceipt.message_id == message.id,
            MessageReceipt.read_at.is_not(None),
        )
    )
    return ReceiptSummary(
        delivered_count=delivered or 0,
        read_count=read or 0,
        recipient_count=total_recipients,
    )


async def serialize_message(
    db: AsyncSession, message: Message, total_recipients: int
) -> MessageOut:
    reactions = await db.execute(
        select(Reaction).where(Reaction.message_id == message.id)
    )
    summary = await receipt_summary(db, message, total_recipients)
    body = "" if message.deleted_at else message.ciphertext
    return MessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        seq=message.seq,
        sender_id=message.sender_id,
        client_id=message.client_id,
        content_type=message.content_type,
        body=body,
        reply_to_id=message.reply_to_id,
        created_at=message.created_at,
        edited_at=message.edited_at,
        expires_at=message.expires_at,
        deleted_at=message.deleted_at,
        reactions=[
            ReactionOut(user_id=r.user_id, emoji=r.emoji)
            for r in reactions.scalars().all()
        ],
        receipts=summary,
    )
