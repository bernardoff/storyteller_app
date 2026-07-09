"""
WebSocket Manager for the Storyteller App.
Manages real-time connections between the Storyteller and Players
across campaign sessions.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


# ── Message Type Constants ──────────────────────────────────────────
class MessageType:
    """WebSocket message type constants."""
    DICE_ROLL = "dice_roll"
    COMBAT_UPDATE = "combat_update"
    CHAT_MESSAGE = "chat_message"
    TURN_CHANGE = "turn_change"
    IMAGE_SHARED = "image_shared"
    NOTIFICATION = "notification"
    PLAYER_JOINED = "player_joined"
    PLAYER_LEFT = "player_left"
    CHARACTER_UPDATE = "character_update"
    SESSION_UPDATE = "session_update"
    CREDIT_UPDATE = "credit_update"


class ConnectionManager:
    """Manages WebSocket connections per campaign.

    Connections are stored as:
        {campaign_id: {user_id: WebSocket}}

    This allows broadcasting to all users in a campaign,
    or sending targeted messages to specific players.
    """

    def __init__(self) -> None:
        # {campaign_id: {user_id: WebSocket}}
        self._connections: dict[int, dict[int, WebSocket]] = {}

    async def connect(
        self, websocket: WebSocket, user_id: int, campaign_id: int, display_name: str = "Unknown"
    ) -> None:
        """Accept a WebSocket connection and register it."""
        await websocket.accept()

        if campaign_id not in self._connections:
            self._connections[campaign_id] = {}

        # Close any existing connection for this user in this campaign
        if user_id in self._connections[campaign_id]:
            try:
                await self._connections[campaign_id][user_id].close()
            except Exception:
                pass

        self._connections[campaign_id][user_id] = websocket
        logger.info(
            "User %d connected to campaign %d. Total: %d",
            user_id, campaign_id, len(self._connections[campaign_id]),
        )

        # Notify other users
        await self.broadcast(
            campaign_id,
            {
                "type": MessageType.PLAYER_JOINED,
                "user_id": user_id,
                "display_name": display_name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            exclude_user=user_id,
        )

    def disconnect(
        self, websocket: WebSocket, user_id: int, campaign_id: int
    ) -> None:
        """Remove a WebSocket connection."""
        if campaign_id in self._connections:
            self._connections[campaign_id].pop(user_id, None)
            if not self._connections[campaign_id]:
                del self._connections[campaign_id]

        logger.info("User %d disconnected from campaign %d", user_id, campaign_id)

    async def broadcast(
        self,
        campaign_id: int,
        message: dict[str, Any],
        exclude_user: int | None = None,
    ) -> None:
        """Send a JSON message to all connected users in a campaign.

        Args:
            campaign_id: The campaign to broadcast to.
            message: The message dict to serialize and send.
            exclude_user: Optional user_id to exclude from broadcast.
        """
        if campaign_id not in self._connections:
            return

        dead_connections: list[int] = []
        data = json.dumps(message, default=str)

        for uid, ws in self._connections[campaign_id].items():
            if uid == exclude_user:
                continue
            try:
                await ws.send_text(data)
            except Exception as exc:
                logger.warning(
                    "Failed to send to user %d in campaign %d: %s",
                    uid, campaign_id, exc,
                )
                dead_connections.append(uid)

        # Clean up dead connections
        for uid in dead_connections:
            self._connections[campaign_id].pop(uid, None)

    async def send_personal(
        self, user_id: int, campaign_id: int, message: dict[str, Any]
    ) -> bool:
        """Send a JSON message to a specific user in a campaign.

        Returns:
            True if message was sent, False if user not connected.
        """
        if (
            campaign_id not in self._connections
            or user_id not in self._connections[campaign_id]
        ):
            return False

        try:
            data = json.dumps(message, default=str)
            await self._connections[campaign_id][user_id].send_text(data)
            return True
        except Exception as exc:
            logger.warning(
                "Failed to send personal message to user %d: %s", user_id, exc
            )
            self._connections[campaign_id].pop(user_id, None)
            return False

    def get_connected_users(self, campaign_id: int) -> list[int]:
        """Return list of connected user IDs for a campaign."""
        if campaign_id not in self._connections:
            return []
        return list(self._connections[campaign_id].keys())

    def get_connection_count(self, campaign_id: int) -> int:
        """Return the number of connected users for a campaign."""
        if campaign_id not in self._connections:
            return 0
        return len(self._connections[campaign_id])


# ── Module-level singleton ──────────────────────────────────────────
manager = ConnectionManager()
