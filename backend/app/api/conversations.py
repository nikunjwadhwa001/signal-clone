from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.models import (
    Conversation,
    ConversationMember,
    Message,
    User,
)
from app.models.conversation import ConversationType, MemberRole
from app.schemas.conversation import (
    AddMemberRequest,
    ConversationOut,
    CreateConversationRequest,
    MemberOut,
    MessagePreview,
    ReadRequest,
    UpdateConversationRequest,
)
from app.schemas.message import MessageOut
from app.schemas.user import UserPublic
from app.services import conversation_service as convo_svc
from app.services import message_service as msg_svc

router = APIRouter(prefix="/conversations", tags=["conversations"])


async def _build_conversation_out(
    db: DbSession, convo: Conversation, user_id: int
) -> ConversationOut:
    member_rows = await db.execute(
        select(ConversationMember, User)
        .join(User, User.id == ConversationMember.user_id)
        .where(ConversationMember.conversation_id == convo.id)
    )
    members: list[MemberOut] = []
    me_member: ConversationMember | None = None
    peer: UserPublic | None = None
    for member, u in member_rows.all():
        members.append(
            MemberOut(user=UserPublic.model_validate(u), role=member.role)
        )
        if member.user_id == user_id:
            me_member = member
        elif convo.type == ConversationType.direct:
            peer = UserPublic.model_validate(u)

    last_read = me_member.last_read_seq if me_member else 0
    unread = await db.scalar(
        select(func.count()).select_from(Message).where(
            Message.conversation_id == convo.id,
            Message.seq > last_read,
            Message.sender_id != user_id,
            Message.deleted_at.is_(None),
        )
    )

    last_msg_row = await db.execute(
        select(Message)
        .where(Message.conversation_id == convo.id)
        .order_by(Message.seq.desc())
        .limit(1)
    )
    last_msg = last_msg_row.scalars().first()
    preview = None
    if last_msg is not None:
        preview = MessagePreview(
            id=last_msg.id,
            seq=last_msg.seq,
            sender_id=last_msg.sender_id,
            content_type=last_msg.content_type,
            body="" if last_msg.deleted_at else last_msg.ciphertext,
            created_at=last_msg.created_at,
            deleted_at=last_msg.deleted_at,
        )

    return ConversationOut(
        id=convo.id,
        type=convo.type,
        name=convo.name,
        avatar_url=convo.avatar_url,
        disappearing_seconds=convo.disappearing_seconds,
        last_message_at=convo.last_message_at,
        last_seq=convo.last_seq,
        unread_count=unread or 0,
        members=members,
        last_message=preview,
        peer=peer,
    )


@router.get("", response_model=list[ConversationOut])
async def list_conversations(user: CurrentUser, db: DbSession):
    my_convos = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user.id
    )
    rows = await db.execute(
        select(Conversation)
        .where(Conversation.id.in_(my_convos))
        .order_by(
            Conversation.last_message_at.desc().nullslast(),
            Conversation.id.desc(),
        )
    )
    return [
        await _build_conversation_out(db, c, user.id)
        for c in rows.scalars().all()
    ]


@router.post(
    "", response_model=ConversationOut, status_code=status.HTTP_201_CREATED
)
async def create_conversation(
    payload: CreateConversationRequest, user: CurrentUser, db: DbSession
):
    member_ids = {mid for mid in payload.member_ids if mid != user.id}
    if not member_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Need at least one other member",
        )
    # Validate the members exist.
    for mid in member_ids:
        if await db.get(User, mid) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {mid} not found",
            )

    if payload.type == ConversationType.direct:
        if len(member_ids) != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Direct chat needs exactly one other member",
            )
        other = next(iter(member_ids))
        existing = await convo_svc.find_direct_conversation(db, user.id, other)
        if existing is not None:
            return await _build_conversation_out(db, existing, user.id)

    convo = Conversation(
        type=payload.type,
        name=payload.name if payload.type == ConversationType.group else None,
        created_by=user.id,
    )
    db.add(convo)
    await db.flush()

    # Creator is admin; others are members. joined_at_seq=0 since no messages.
    db.add(
        ConversationMember(
            conversation_id=convo.id,
            user_id=user.id,
            role=MemberRole.admin,
            joined_at_seq=0,
        )
    )
    for mid in member_ids:
        db.add(
            ConversationMember(
                conversation_id=convo.id,
                user_id=mid,
                role=MemberRole.member,
                joined_at_seq=0,
            )
        )
    await db.commit()
    await db.refresh(convo)
    return await _build_conversation_out(db, convo, user.id)


async def _require_member(db, conversation_id: int, user_id: int) -> Conversation:
    convo = await db.get(Conversation, conversation_id)
    # 404 (not 403) when the user isn't a member, so we don't leak existence.
    if convo is None or not await convo_svc.is_member(
        db, conversation_id, user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )
    return convo


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def get_messages(
    conversation_id: int,
    user: CurrentUser,
    db: DbSession,
    before_seq: int | None = Query(default=None),
    limit: int = Query(default=50, le=100),
):
    await _require_member(db, conversation_id, user.id)
    member = await convo_svc.get_membership(db, conversation_id, user.id)

    stmt = (
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            # History gating: a member never sees messages before they joined.
            Message.seq > member.joined_at_seq,
        )
        .order_by(Message.seq.desc())
        .limit(limit)
    )
    if before_seq is not None:
        stmt = stmt.where(Message.seq < before_seq)

    # Hide expired disappearing messages.
    now = datetime.now(timezone.utc)
    rows = await db.execute(stmt)
    messages = [
        m
        for m in rows.scalars().all()
        if m.expires_at is None
        or m.expires_at.replace(tzinfo=timezone.utc) > now
    ]
    total_recipients = await msg_svc.recipient_count(db, conversation_id)
    result = [
        await msg_svc.serialize_message(db, m, total_recipients)
        for m in reversed(messages)
    ]
    return result


@router.post("/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    conversation_id: int,
    payload: ReadRequest,
    user: CurrentUser,
    db: DbSession,
):
    await _require_member(db, conversation_id, user.id)
    await msg_svc.mark_read_up_to(
        db,
        conversation_id=conversation_id,
        user_id=user.id,
        up_to_seq=payload.up_to_seq,
    )
    await db.commit()


@router.get("/{conversation_id}/members", response_model=list[MemberOut])
async def get_members(conversation_id: int, user: CurrentUser, db: DbSession):
    await _require_member(db, conversation_id, user.id)
    rows = await db.execute(
        select(ConversationMember, User)
        .join(User, User.id == ConversationMember.user_id)
        .where(ConversationMember.conversation_id == conversation_id)
    )
    return [
        MemberOut(user=UserPublic.model_validate(u), role=m.role)
        for m, u in rows.all()
    ]


@router.post("/{conversation_id}/members", status_code=status.HTTP_204_NO_CONTENT)
async def add_member(
    conversation_id: int,
    payload: AddMemberRequest,
    user: CurrentUser,
    db: DbSession,
):
    convo = await _require_member(db, conversation_id, user.id)
    if convo.type != ConversationType.group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only add members to groups",
        )
    if not await convo_svc.is_admin(db, conversation_id, user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admins only"
        )
    if await db.get(User, payload.user_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    existing = await db.get(
        ConversationMember, (conversation_id, payload.user_id)
    )
    if existing is None:
        # New member joins at the current head, so they don't get the backlog.
        db.add(
            ConversationMember(
                conversation_id=conversation_id,
                user_id=payload.user_id,
                role=MemberRole.member,
                joined_at_seq=convo.last_seq,
            )
        )
        await db.commit()


@router.delete(
    "/{conversation_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_member(
    conversation_id: int,
    member_id: int,
    user: CurrentUser,
    db: DbSession,
):
    convo = await _require_member(db, conversation_id, user.id)
    # A user may always remove themselves (leave); otherwise admin required.
    if member_id != user.id and not await convo_svc.is_admin(
        db, conversation_id, user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admins only"
        )
    target = await db.get(ConversationMember, (conversation_id, member_id))
    if target is None:
        return
    # Don't allow removing the last admin — reject and ask them to promote.
    if target.role == MemberRole.admin:
        admin_count = await db.scalar(
            select(func.count()).select_from(ConversationMember).where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role == MemberRole.admin,
            )
        )
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last admin; promote someone first",
            )
    await db.delete(target)
    await db.commit()


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def update_conversation(
    conversation_id: int,
    payload: UpdateConversationRequest,
    user: CurrentUser,
    db: DbSession,
):
    convo = await _require_member(db, conversation_id, user.id)
    if convo.type == ConversationType.group and not await convo_svc.is_admin(
        db, conversation_id, user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admins only"
        )
    if payload.name is not None:
        convo.name = payload.name
    if payload.avatar_url is not None:
        convo.avatar_url = payload.avatar_url
    if payload.disappearing_seconds is not None:
        convo.disappearing_seconds = payload.disappearing_seconds
    await db.commit()
    await db.refresh(convo)
    return await _build_conversation_out(db, convo, user.id)
