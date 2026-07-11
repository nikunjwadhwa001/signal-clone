"""Seed the database with demo users, conversations, and messages so the app
is immediately usable.

Run:  python -m app.seed        (wipes and recreates all data)
Demo login for every seeded user: password "password", OTP "123456".

`seed_if_empty()` is also called automatically on API boot (see app/main.py)
so a fresh production database (e.g. a newly provisioned Postgres with no
shell/one-off-job access on a free hosting tier) seeds itself on first
deploy without wiping data on every subsequent restart.
"""

import asyncio
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
    ("nikunj", "Nikunj Wadhwa", "+15550100101", "Coffee, code, repeat."),
    ("hritish", "Hritish", "+15550100102", "Available"),
    ("aryan", "Aryan", "+15550100103", "Out hiking 🏔️"),
    ("samdeep", "Samdeep", "+15550100104", "At the gym"),
    ("navya", "Navya", "+15550100105", "Speak freely."),
    ("monika", "Monika", "+15550100106", "Building things."),
]

DIRECT_SCRIPTS = {
    ("nikunj", "hritish"): [
        ("hritish", "Hey Nikunj! Did you get a chance to look at the PR?"),
        ("nikunj", "Yeah, reviewing it now. Looks solid 👍"),
        ("hritish", "Awesome, thanks. Let me know if anything's off."),
        ("nikunj", "Will do. One small nit on the naming, otherwise good to merge."),
        ("hritish", "Cool, I'll push a fixup in a sec."),
    ],
    ("nikunj", "aryan"): [
        ("aryan", "Lunch tomorrow?"),
        ("nikunj", "Yes! The usual place at 1?"),
        ("aryan", "Perfect, see you then 😊"),
    ],
    ("nikunj", "samdeep"): [
        ("samdeep", "Can you send me the deck when you get a chance?"),
        ("nikunj", "Just sent it over."),
        ("samdeep", "Got it, thanks!"),
    ],
}

GROUPS = [
    (
        "Weekend Trip 🏕️",
        ["nikunj", "hritish", "aryan", "samdeep"],
        [
            ("aryan", "Okay who's driving?"),
            ("samdeep", "I can drive, I've got the big car."),
            ("hritish", "Nice. I'll bring snacks 🍿"),
            ("nikunj", "I'll handle the campsite booking."),
            ("aryan", "You're the best. This is going to be so fun!"),
        ],
    ),
    (
        "Design Team",
        ["nikunj", "navya", "monika"],
        [
            ("navya", "New mockups are up in Figma."),
            ("monika", "Looking at them now — love the new color system."),
            ("nikunj", "Agreed, the contrast is much better."),
            ("navya", "Thanks! I'll finalize by EOD."),
        ],
    ),
]


async def _populate(db: AsyncSession) -> None:
    """Insert the demo dataset. Assumes tables exist; safe to call against an
    empty database (does not drop/recreate schema)."""
    # Clear (in case tables pre-existed with partial data from a retry).
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

    # Contacts: everyone knows nikunj; nikunj knows everyone.
    for username, u in users.items():
        if username != "nikunj":
            db.add(Contact(owner_id=users["nikunj"].id, contact_user_id=u.id))
            db.add(Contact(owner_id=u.id, contact_user_id=users["nikunj"].id))

    base_time = datetime.now(timezone.utc) - timedelta(days=2)
    clock = [base_time]

    def next_time(gap_minutes: int = 0) -> datetime:
        clock[0] = clock[0] + timedelta(minutes=gap_minutes or random.randint(2, 40))
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
            member = await db.get(ConversationMember, (convo.id, mu.id))
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
                user_id=users["hritish"].id,
                emoji="👍",
            )
        )

    await db.commit()
    print("Seeded users:", ", ".join(u[0] for u in USERS))
    print('Login with password "password", OTP "123456".')


async def seed_if_empty() -> None:
    """Called on every API boot. A no-op unless the users table is
    genuinely empty, so it never wipes real data on a restart/redeploy —
    only fires once, on a database's very first boot."""
    async with SessionLocal() as db:
        count = await db.scalar(select(func.count()).select_from(User))
        if count:
            return
        await _populate(db)


async def seed() -> None:
    """CLI entrypoint (`python -m app.seed` / `./deploy_local.sh reseed`):
    wipes and recreates the schema, then populates it. Destructive by
    design — use seed_if_empty() for anything that runs automatically."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        await _populate(db)


if __name__ == "__main__":
    asyncio.run(seed())
