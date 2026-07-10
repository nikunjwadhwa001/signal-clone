"""Membership and conversation queries shared by REST and WebSocket layers."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Conversation, ConversationMember
from app.models.conversation import MemberRole


async def get_membership(
    db: AsyncSession, conversation_id: int, user_id: int
) -> ConversationMember | None:
    return await db.get(ConversationMember, (conversation_id, user_id))


async def is_member(
    db: AsyncSession, conversation_id: int, user_id: int
) -> bool:
    return (await get_membership(db, conversation_id, user_id)) is not None


async def list_member_ids(db: AsyncSession, conversation_id: int) -> list[int]:
    rows = await db.execute(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id
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
