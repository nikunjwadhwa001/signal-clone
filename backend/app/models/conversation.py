import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Enum,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UTCDateTime


class ConversationType(str, enum.Enum):
    direct = "direct"
    group = "group"


class MemberRole(str, enum.Enum):
    admin = "admin"
    member = "member"


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[ConversationType] = mapped_column(
        Enum(ConversationType), default=ConversationType.direct
    )
    name: Mapped[str | None] = mapped_column(String(128))  # groups only
    avatar_url: Mapped[str | None] = mapped_column(String(512))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    disappearing_seconds: Mapped[int] = mapped_column(Integer, default=0)
    # Denormalized for cheap conversation-list sorting.
    last_message_at: Mapped[datetime | None] = mapped_column(
        UTCDateTime()
    )
    # Server-side monotonic counter; the next message gets seq = last_seq + 1.
    last_seq: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), server_default=func.now()
    )


class ConversationMember(Base):
    __tablename__ = "conversation_members"

    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[MemberRole] = mapped_column(
        Enum(MemberRole), default=MemberRole.member
    )
    # Messages below this seq predate the member's join; they never see them.
    joined_at_seq: Mapped[int] = mapped_column(Integer, default=0)
    # Highest seq this member has read; unread = messages with seq above it.
    last_read_seq: Mapped[int] = mapped_column(Integer, default=0)
    muted: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), server_default=func.now()
    )
