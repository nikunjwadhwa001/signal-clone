"""Membership and conversation queries shared by REST and WebSocket layers."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Conversation, ConversationMember
from app.models.conversation import MemberRole


async def get_membership(
    db: AsyncSession, conversation_id: int, user_id: int
) -> ConversationMember | None:
    """Active membership only — None if the user never joined *or* has since
    left/been removed. Use this for anything that should stop working the
    moment someone leaves: sending, admin actions, receipts."""
    member = await db.get(ConversationMember, (conversation_id, user_id))
    if member is None or member.left_at is not None:
        return None
    return member


async def get_membership_any(
    db: AsyncSession, conversation_id: int, user_id: int
) -> ConversationMember | None:
    """Membership regardless of left_at — use for read access, since a former
    member should still be able to see history up to when they left."""
    return await db.get(ConversationMember, (conversation_id, user_id))


async def is_member(
    db: AsyncSession, conversation_id: int, user_id: int
) -> bool:
    return (await get_membership(db, conversation_id, user_id)) is not None


async def list_member_ids(db: AsyncSession, conversation_id: int) -> list[int]:
    """Active members only — a removed member shouldn't count toward
    delivery/read fan-out for future messages."""
    rows = await db.execute(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.left_at.is_(None),
        )
    )
    return [r[0] for r in rows.all()]


async def is_admin(db: AsyncSession, conversation_id: int, user_id: int) -> bool:
    m = await get_membership(db, conversation_id, user_id)
    return m is not None and m.role == MemberRole.admin


async def find_direct_conversation(
    db: AsyncSession, user_a: int, user_b: int
) -> Conversation | None:
    """A direct conversation is uniquely identified by its exact two members;
    used to make POST /conversations idempotent for 1:1 chats."""
    a_convos = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_a
    )
    b_convos = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_b
    )
    rows = await db.execute(
        select(Conversation)
        .where(
            Conversation.type == "direct",
            Conversation.id.in_(a_convos),
            Conversation.id.in_(b_convos),
        )
    )
    return rows.scalars().first()
