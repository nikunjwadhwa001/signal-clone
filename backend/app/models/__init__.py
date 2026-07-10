"""SQLAlchemy models.

Design principle: messages are immutable, append-only rows; every piece of
mutable per-user state (read position, reactions, receipts) lives in a join
table so status can always be derived rather than stored and kept in sync.
"""

from app.models.attachment import Attachment
from app.models.contact import Contact
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message, MessageReceipt, Reaction
from app.models.refresh_token import RefreshToken
from app.models.user import User

__all__ = [
    "User",
    "Contact",
    "Conversation",
    "ConversationMember",
    "Message",
    "MessageReceipt",
    "Reaction",
    "Attachment",
    "RefreshToken",
]
