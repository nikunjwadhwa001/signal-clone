"""In-process WebSocket connection registry.

Maps user_id -> set of live sockets, so a user open in two tabs receives every
event on both. This is single-process only; scaling to multiple workers would
require a Redis pub/sub fan-out layer. That limitation is documented in the
README and is the honest answer to "how does this scale?".
"""

import asyncio
from collections import defaultdict

from fastapi import WebSocket


class ConnectionRegistry:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def add(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._connections[user_id].add(ws)

    async def remove(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._connections[user_id].discard(ws)
            if not self._connections[user_id]:
                self._connections.pop(user_id, None)

    def is_online(self, user_id: int) -> bool:
        return user_id in self._connections

    async def send_to_user(self, user_id: int, message: dict) -> None:
        for ws in list(self._connections.get(user_id, set())):
            try:
                await ws.send_json(message)
            except Exception:
                # Drop dead sockets; the receive loop will also clean up.
                await self.remove(user_id, ws)

    async def send_to_users(self, user_ids: list[int], message: dict) -> None:
        for uid in user_ids:
            await self.send_to_user(uid, message)


registry = ConnectionRegistry()
