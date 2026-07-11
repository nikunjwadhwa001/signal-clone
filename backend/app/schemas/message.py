from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    emoji: str


class ReceiptSummary(BaseModel):
    delivered_count: int
    read_count: int
    recipient_count: int


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    seq: int
    sender_id: int
    client_id: str
    content_type: str
    body: str  # decrypted view of `ciphertext`
    reply_to_id: int | None
    created_at: datetime
    edited_at: datetime | None
    expires_at: datetime | None
    deleted_at: datetime | None
    reactions: list[ReactionOut] = []
    receipts: ReceiptSummary | None = None


class SendMessageRequest(BaseModel):
    conversation_id: int
    client_id: str = Field(min_length=1, max_length=64)
    body: str = Field(min_length=1, max_length=8000)
    content_type: str = "text"
    reply_to_id: int | None = None

    @field_validator("body")
    @classmethod
    def body_not_blank(cls, v: str) -> str:
        # min_length=1 alone lets "   " through; the WS path already does
        # this same .strip() check, so mirror it here for the REST fallback.
        if not v.strip():
            raise ValueError("Message body cannot be blank")
        return v


class ReactionRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)
