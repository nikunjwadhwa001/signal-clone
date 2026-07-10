from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import DateTime, TypeDecorator

from app.core.config import settings


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    """SQLite has no real tz-aware timestamp type, so SQLAlchemy hands back
    naive datetimes on read. That makes JSON-serialized timestamps ambiguous
    to browser Date parsing (interpreted as local time, not UTC), silently
    shifting displayed times/day-grouping by the client's UTC offset. This
    type always stores UTC and always returns tz-aware UTC datetimes."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


engine = create_async_engine(
    settings.database_url,
    echo=False,
    # check_same_thread only matters for sqlite; harmless connect arg elsewhere.
    connect_args={"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {},
)

SessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


@event.listens_for(Engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record):
    """WAL lets readers and the single writer coexist; busy_timeout makes
    concurrent WS writers wait for the lock instead of erroring."""
    # Only applies to sqlite connections.
    if dbapi_connection.__class__.__module__.startswith("sqlite") or hasattr(
        dbapi_connection, "isolation_level"
    ):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.close()
        except Exception:
            # Non-sqlite backends will ignore these pragmas.
            pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
