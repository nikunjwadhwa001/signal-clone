"""Seed the database with demo users, conversations, and messages so the app
is immediately usable. Idempotent-ish: it wipes and recreates all data.

Run:  python -m app.seed
Demo login for every seeded user: password "password", OTP "123456".
"""

import asyncio
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    Contact,
    Conversation,
    ConversationMember,
    Message,
    MessageReceipt,
    Reaction,
    RefreshToken,
    User,
)
from app.models.conversation import ConversationType, MemberRole


def _safety_number() -> str:
    digits = "".join(random.choice("0123456789") for _ in range(60))
    return " ".join(digits[i : i + 5] for i in range(0, 60, 5))


USERS = [
    ("alice", "Alice Johnson", "+15550100101", "Coffee, code, repeat."),
    ("bob", "Bob Martinez", "+15550100102", "Available"),
    ("carol", "Carol Nguyen", "+15550100103", "Out hiking 🏔️"),
    ("dave", "Dave Patel", "+15550100104", "At the gym"),
    ("erin", "Erin Walsh", "+15550100105", "Speak freely."),
    ("frank", "Frank Obi", "+15550100106", "Building things."),
]

DIRECT_SCRIPTS = {
    ("alice", "bob"): [
        ("bob", "Hey Alice! Did you get a chance to look at the PR?"),
        ("alice", "Yeah, reviewing it now. Looks solid 👍"),
        ("bob", "Awesome, thanks. Let me know if anything's off."),
        ("alice", "Will do. One small nit on the naming, otherwise good to merge."),
        ("bob", "Cool, I'll push a fixup in a sec."),
    ],
    ("alice", "carol"): [
        ("carol", "Lunch tomorrow?"),
        ("alice", "Yes! The usual place at 1?"),
        ("carol", "Perfect, see you then 😊"),
    ],
    ("alice", "dave"): [
        ("dave", "Can you send me the deck when you get a chance?"),
        ("alice", "Just sent it over."),
        ("dave", "Got it, thanks!"),
    ],
}

GROUPS = [
    (
        "Weekend Trip 🏕️",
        ["alice", "bob", "carol", "dave"],
        [
            ("carol", "Okay who's driving?"),
            ("dave", "I can drive, I've got the big car."),
            ("bob", "Nice. I'll bring snacks 🍿"),
            ("alice", "I'll handle the campsite booking."),
            ("carol", "You're the best. This is going to be so fun!"),
        ],
    ),
    (
        "Design Team",
        ["alice", "erin", "frank"],
        [
            ("erin", "New mockups are up in Figma."),
            ("frank", "Looking at them now — love the new color system."),
            ("alice", "Agreed, the contrast is much better."),
            ("erin", "Thanks! I'll finalize by EOD."),
        ],
    ),
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        # Clear (in case tables pre-existed).
        for model in (
            Reaction,
            MessageReceipt,
            Message,
            ConversationMember,
            Conversation,
            Contact,
            RefreshToken,
            User,
        ):
            await db.execute(delete(model))

        users: dict[str, User] = {}
        for username, name, phone, about in USERS:
            u = User(
                username=username,
                display_name=name,
                phone=phone,
                about=about,
                password_hash=hash_password("password"),
                safety_number=_safety_number(),
                last_seen_at=datetime.now(timezone.utc)
                - timedelta(minutes=random.randint(0, 240)),
            )
            db.add(u)
            users[username] = u
        await db.flush()

        # Contacts: everyone knows alice; alice knows everyone.
        for username, u in users.items():
            if username != "alice":
                db.add(
                    Contact(
                        owner_id=users["alice"].id, contact_user_id=u.id
                    )
                )
                db.add(
                    Contact(
                        owner_id=u.id, contact_user_id=users["alice"].id
                    )
                )

        base_time = datetime.now(timezone.utc) - timedelta(days=2)
        clock = [base_time]

        def next_time(gap_minutes: int = 0) -> datetime:
            clock[0] = clock[0] + timedelta(
                minutes=gap_minutes or random.randint(2, 40)
            )
            return clock[0]

        async def build_conversation(convo: Conversation, member_usernames, script):
            db.add(convo)
            await db.flush()
            member_users = [users[u] for u in member_usernames]
            for i, mu in enumerate(member_users):
                db.add(
                    ConversationMember(
                        conversation_id=convo.id,
                        user_id=mu.id,
                        role=MemberRole.admin if i == 0 else MemberRole.member,
                        joined_at_seq=0,
                    )
                )
            seq = 0
            last_message = None
            for sender_username, body in script:
                seq += 1
                ts = next_time()
                msg = Message(
                    conversation_id=convo.id,
                    seq=seq,
                    sender_id=users[sender_username].id,
                    client_id=f"seed-{convo.id}-{seq}",
                    ciphertext=body,
                    content_type="text",
                    created_at=ts,
                )
                db.add(msg)
                await db.flush()
                last_message = msg
                # Everyone except the sender has read all but the last message,
                # leaving a realistic unread tail on the newest message.
                for mu in member_users:
                    if mu.id == msg.sender_id:
                        continue
                    is_last = body == script[-1][1]
                    db.add(
                        MessageReceipt(
                            message_id=msg.id,
                            user_id=mu.id,
                            delivered_at=ts,
                            read_at=None if is_last else ts,
                        )
                    )
            convo.last_seq = seq
            convo.last_message_at = last_message.created_at if last_message else None
            # Advance each member's last_read_seq to the second-to-last message.
            for mu in member_users:
                member = await db.get(
                    ConversationMember, (convo.id, mu.id)
                )
                member.last_read_seq = max(seq - 1, 0)

        for (a, b), script in DIRECT_SCRIPTS.items():
            convo = Conversation(type=ConversationType.direct, created_by=users[a].id)
            await build_conversation(convo, [a, b], script)

        for name, members, script in GROUPS:
            convo = Conversation(
                type=ConversationType.group,
                name=name,
                created_by=users[members[0]].id,
            )
            await build_conversation(convo, members, script)

        # A couple of reactions for flavor.
        first_group_msg = await db.get(Message, 1)
        if first_group_msg:
            db.add(
                Reaction(
                    message_id=first_group_msg.id,
                    user_id=users["bob"].id,
                    emoji="👍",
                )
            )

        await db.commit()
    print("Seeded users:", ", ".join(users := [u[0] for u in USERS]))
    print('Login with password "password", OTP "123456".')


if __name__ == "__main__":
    asyncio.run(seed())
