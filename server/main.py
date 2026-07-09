"""
Storyteller App — Main FastAPI Application
Vampire: The Dark Ages V20 Multiplayer RPG Platform

Entry point for the backend server.
Run with: uvicorn server.main:app --reload --host 0.0.0.0 --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from server.config import get_settings
from server.database import init_db
from server.websocket_manager import manager, MessageType
from server.auth import get_current_user

# ── Logging setup ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan (startup/shutdown) ─────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: initialize DB and RAG on startup."""
    logger.info("🧛 Storyteller App starting up...")

    # Initialize database tables
    await init_db()
    logger.info("✅ Database initialized")

    # Initialize RAG knowledge base (runs in background, can be slow)
    try:
        from server.engines.rag_engine import initialize_knowledge_base
        settings = get_settings()
        initialize_knowledge_base(settings.KNOWLEDGE_BASE_PATH)
        logger.info("✅ Knowledge base indexed")
    except Exception as exc:
        logger.warning("⚠️ Knowledge base initialization failed: %s", exc)

    logger.info("🧛 Storyteller App ready!")
    yield

    logger.info("🧛 Storyteller App shutting down...")


# ── Create FastAPI app ──────────────────────────────────────────────
settings = get_settings()

app = FastAPI(
    title="Storyteller App",
    description="Vampire: The Dark Ages V20 — Multiplayer RPG Platform",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from server.routers.auth_routes import router as auth_router
from server.routers.dice_routes import router as dice_router
from server.routers.rules_routes import router as rules_router
from server.routers.character_routes import router as character_router
from server.routers.combat_routes import router as combat_router
from server.routers.session_routes import router as session_router
from server.routers.action_routes import router as action_router
from server.routers.lore_routes import router as lore_router
from server.routers.vtt_routes import router as vtt_router
from server.routers.admin_routes import router as admin_router

app.include_router(auth_router)
app.include_router(dice_router)
app.include_router(rules_router)
app.include_router(character_router)
app.include_router(combat_router)
app.include_router(session_router)
app.include_router(action_router)
app.include_router(lore_router)
app.include_router(vtt_router)
app.include_router(admin_router)


# ── Health check ────────────────────────────────────────────────────
@app.get("/api/health", tags=["system"])
async def health_check():
    """Basic health check endpoint."""
    return {
        "status": "ok",
        "app": "Storyteller App",
        "version": "0.1.0",
    }


# ── WebSocket endpoint ──────────────────────────────────────────────
@app.websocket("/ws/{campaign_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    campaign_id: int,
    token: str = Query(...),
):
    """WebSocket endpoint for real-time game updates.

    Connect with: ws://host:port/ws/{campaign_id}?token={jwt_token}

    The token is validated to identify the user. All game events
    (dice rolls, combat updates, chat messages, etc.) are broadcast
    through this connection.
    """
    # Validate token to get user_id
    from jose import JWTError, jwt as jose_jwt
    from server.database import get_db, User
    from sqlalchemy import select

    try:
        payload = jose_jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        username: str = payload.get("sub")
        if username is None:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Get user_id from database
    from server.database import _get_session_factory
    session_factory = _get_session_factory()
    async with session_factory() as db:
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if user is None:
            await websocket.close(code=4001, reason="User not found")
            return
        user_id = user.id
        display_name = user.display_name

    # Connect and listen
    await manager.connect(websocket, user_id, campaign_id, display_name)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = __import__("json").loads(data)
                # Add sender info
                message["sender_id"] = user_id
                message["sender_name"] = display_name
                message["timestamp"] = __import__("datetime").datetime.now(
                    __import__("datetime").timezone.utc
                ).isoformat()

                # Broadcast to all users in campaign
                await manager.broadcast(campaign_id, message)
            except Exception as exc:
                logger.error("Error processing WebSocket message: %s", exc)
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id, campaign_id)
        await manager.broadcast(
            campaign_id,
            {
                "type": MessageType.PLAYER_LEFT,
                "user_id": user_id,
                "display_name": display_name,
            },
        )


# ── Static files for uploaded images and frontend ──────────────────
import os
os.makedirs("data/images", exist_ok=True)
app.mount("/static/images", StaticFiles(directory="data/images"), name="images")

os.makedirs("client", exist_ok=True)
app.mount("/", StaticFiles(directory="client", html=True), name="client")
