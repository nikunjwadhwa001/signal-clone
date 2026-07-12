import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import auth, contacts, conversations, messages, users
from app.core.config import settings
from app.core.database import Base, engine
from app.seed import clear_broken_avatars, seed_if_empty
from app.ws import endpoint as ws_endpoint


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Tables are created on every boot so a fresh clone / fresh managed DB
    # comes up ready; Alembic migrations are the source of truth for schema
    # changes once this needs real migrations. seed_if_empty() only inserts
    # demo data the very first time (empty users table) — safe to run on
    # every restart since it's a no-op once real data exists, which is what
    # makes a free-tier host with no shell/one-off-job access self-seed.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_if_empty()
    await clear_broken_avatars()
    os.makedirs(settings.upload_dir, exist_ok=True)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(contacts.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(ws_endpoint.router)

os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}
