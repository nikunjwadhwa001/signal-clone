from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.conversation import ConversationType, MemberRole
from app.schemas.user import UserPublic


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserPublic
    role: MemberRole


class MessagePreview(BaseModel):
    id: int
    seq: int
    sender_id: int
    content_type: str
    body: str
    created_at: datetime
    deleted_at: datetime | None = None


class ConversationOut(BaseModel):
    id: int
    type: ConversationType
    name: str | None
    avatar_url: str | None
    disappearing_seconds: int
    last_message_at: datetime | None
    last_seq: int
    unread_count: int
    # False once you've left or been removed — the client uses this to show
    # a "you're no longer a member" banner and disable the composer.
    is_active_member: bool = True
    members: list[MemberOut]
    last_message: MessagePreview | None = None
    # For direct chats, the other participant (convenience for the client).
    peer: UserPublic | None = None


class CreateConversationRequest(BaseModel):
    type: ConversationType
    # For direct: exactly one other user id. For group: one or more.
    member_ids: list[int] = Field(min_length=1)
    name: str | None = Field(default=None, max_length=128)


class UpdateConversationRequest(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    avatar_url: str | None = Field(default=None, max_length=512)
    disappearing_seconds: int | None = Field(default=None, ge=0)


class AddMemberRequest(BaseModel):
    user_id: int


class ReadRequest(BaseModel):
    up_to_seq: int = Field(ge=0)
