# Signal Clone

A functional clone of Signal Messenger — real-time 1:1 and group messaging, contacts, delivery/read receipts, typing indicators, and a Signal-styled UI. Built as an SDE fullstack take-home assignment. Real end-to-end encryption and phone verification are mocked, as scoped by the assignment brief.

**Live demo:** https://signal-clone-1.onrender.com
(demo login: username `nikunj`, password `password`, OTP `123456` — see more seeded accounts below)

## Tech Stack

- **Frontend:** Next.js (App Router) + TypeScript, TanStack Query, Zustand, Tailwind CSS
- **Backend:** FastAPI (Python, async), SQLAlchemy (async ORM)
- **Database:** SQLite locally (via `aiosqlite`); Postgres (via `asyncpg`) in production, since free-tier hosts use ephemeral disks that would otherwise wipe a SQLite file on every redeploy — same schema, swapped via `DATABASE_URL`
- **Real-time:** Native WebSockets (one connection per client, authenticated via a short-lived ticket)
- **Auth:** Username + password + a mocked fixed OTP (`123456`), JWT access tokens, hashed refresh tokens for revocable sessions

## Setup

Requires Docker (OrbStack, Docker Desktop, or Colima) — nothing else to install locally.

```bash
./deploy_local.sh          # build + seed (first run only) + start everything
./deploy_local.sh reseed   # wipe and reseed demo data (also required after any DB schema change)
./deploy_local.sh down     # stop everything
./deploy_local.sh logs     # tail logs
```

- Frontend: http://localhost:3000
- API + docs: http://localhost:8000/docs

**Demo login:** username `nikunj`, password `password`, OTP `123456` (also: `hritish`, `aryan`, `samdeep`, `navya`, `monika` — all seeded with the same password/OTP, pre-populated with sample conversations and a group).

No `.env` file or external API keys are required — every config value has a working default (see `backend/app/core/config.py`). The one exception for a real deployment: override `JWT_SECRET` with a random value instead of the checked-in dev default.

## Architecture Overview

```
frontend/          Next.js app
  app/              routes: /, /chat, /chat/[id], /chat/[id]/info, /chat/settings
  components/       chat pane, composer, sidebar, message bubbles, modals
  lib/
    api/            typed REST client functions (axios)
    ws/             WebSocket connection manager (auto-reconnect, ticket auth)
    hooks/          TanStack Query hooks + the realtime-to-cache event bridge
    stores/         Zustand stores: auth (persisted), realtime presence/typing, theme, toasts

backend/
  app/
    models/         SQLAlchemy models (see schema below)
    schemas/        Pydantic request/response models
    api/            REST routers: auth, users, contacts, conversations, messages
    ws/endpoint.py  WebSocket handler: message send/ack, typing, receipts, presence
    services/       shared business logic (message creation/seq allocation, membership checks) used by both REST and WS paths so behavior can't drift between them
    core/           config, DB engine setup, JWT/password hashing
```

**Real-time delivery model:** the client sends over the WebSocket when connected and transparently falls back to REST if the socket is down; either path renders an optimistic message bubble immediately, keyed by a client-generated `client_id`. The server's `UNIQUE(conversation_id, client_id)` constraint makes a retried send idempotent rather than duplicating a message. Delivery/read receipts, typing indicators, presence, and conversation-list updates (new group, added/removed member, reordering) all push over the same socket so connected clients update live without polling or manual refresh.

**Group membership is soft-deleted:** leaving or being removed from a group sets `left_at`/`left_at_seq` on the membership row instead of deleting it. This means a former member keeps read access to the conversation up to the point they left (matching Signal's real behavior) but can no longer send messages or see anything after their departure, and is excluded from the active member list/count.

## Database Schema

SQLite, 8 tables:

| Table | Purpose | Notable columns |
|---|---|---|
| `users` | Accounts/profile | `username`/`phone` (unique), `password_hash`, `safety_number` (mock E2E fingerprint), `last_seen_at` |
| `contacts` | Directed "A saved B" edge | composite PK `(owner_id, contact_user_id)` |
| `conversations` | Direct or group chat | `type`, `name` (groups), `last_seq` (monotonic message counter), `last_message_at` (denormalized for cheap list sorting), `disappearing_seconds` |
| `conversation_members` | Membership + per-user chat state | composite PK `(conversation_id, user_id)`, `role`, `joined_at_seq`/`left_at_seq` (history visibility window), `last_read_seq` (drives unread count), `left_at` (soft-delete) |
| `messages` | Append-only chat messages | `seq` (per-conversation order), `client_id` (send idempotency key), `ciphertext` (plaintext body — named to reflect the mocked-encryption framing the assignment allows), `content_type` (`text` / `system.*` for structured group-event notices), `reply_to_id`, `expires_at` (disappearing messages), `deleted_at` (tombstone) |
| `message_receipts` | Per-recipient delivery/read state | composite PK `(message_id, user_id)`, `delivered_at`, `read_at` |
| `reactions` | Emoji reactions | composite PK `(message_id, user_id)` |
| `attachments` | Uploaded file metadata | `message_id`, `mime`, `size_bytes`, `storage_path` |
| `refresh_tokens` | Session persistence/revocation | `token_hash` (only the hash is stored), `expires_at`, `revoked_at` |

**Design principle:** messages are immutable and append-only; all *mutable* per-user state — read position, delivery/read receipts, reactions — lives in separate join tables rather than mutating the message row, so status is always derived rather than duplicated and risking drift. Unread counts are computed from `last_read_seq` vs. the conversation's `last_seq`, never stored directly.

## API Overview

All endpoints except `/auth/register`, `/auth/login`, and `/auth/verify` require a `Bearer` JWT access token. Full interactive docs at `/docs`.

- **Auth:** `POST /auth/register`, `/auth/login`, `/auth/verify` (OTP step), `/auth/refresh`, `/auth/logout`, `/auth/ws-ticket` (short-lived ticket to authenticate the WebSocket without putting a long-lived JWT in a URL)
- **Users:** `GET /users/me`, `PATCH /users/me`, `GET /users/search?q=`
- **Contacts:** `GET/POST /contacts`, `DELETE /contacts/{id}` — a direct conversation auto-adds both parties as mutual contacts, mirroring how Signal/WhatsApp don't have a separate manual "add contact" step
- **Conversations:** `GET/POST /conversations`, `GET /conversations/{id}/messages`, `POST /conversations/{id}/read`, `GET/POST /conversations/{id}/members`, `DELETE /conversations/{id}/members/{id}` (remove/leave), `PATCH /conversations/{id}` (rename, disappearing-message timer)
- **Messages:** `POST /messages` (REST fallback for sending), reactions, soft-delete, attachment upload
- **WebSocket:** `GET /ws?ticket=...` — client → server events: `message.send`, `typing.start/stop`, `receipt.read`; server → client: `message.new`, `message.ack`, `receipt.update`, `typing`, `presence`, `conversation.new`/`conversation.updated`

## Assumptions & Scope Decisions

- End-to-end encryption is simulated per the assignment brief: messages are stored as plaintext in a column named `ciphertext` to reflect the framing without implementing real cryptography. A "safety number" is generated per user as a cosmetic stand-in for a real key fingerprint.
- OTP verification is a fixed code (`123456`) for every account, shown directly in the UI during signup/login — no real SMS/phone verification.
- "Add a new contact" means searching among already-registered users by username, not inviting an unregistered phone number (the assignment spec doesn't call for a real SMS invite flow).
- Voice/video calls, Stories, and Linked devices are intentionally left as "Coming soon" placeholders in Settings, as explicitly permitted by the assignment.
- No database migration tool is wired up yet (an empty Alembic scaffold exists); schema changes are applied by recreating tables via `Base.metadata.create_all`, which is why `./deploy_local.sh reseed` is needed after a schema-affecting change.
