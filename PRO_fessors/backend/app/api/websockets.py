from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select

from app.models import OutboxEvent

router = APIRouter(tags=["websockets"])


async def _socket_loop(
    websocket: WebSocket, topic: Literal["markets", "portfolio", "simulation"]
) -> None:
    await websocket.accept()
    app = websocket.scope["app"]
    async with app.state.database.session_factory() as session:
        latest = await session.scalar(
            select(func.max(OutboxEvent.id)).where(OutboxEvent.topic == topic)
        )
    await websocket.send_json(
        {
            "sequence": int(latest or 0),
            "topic": topic,
            "type": "ready",
            "payload": {
                "instruction": "Fetch the REST snapshot, then apply events with a higher sequence."
            },
        }
    )
    async with app.state.websocket_hub.subscribe(topic) as queue:
        while True:
            try:
                event = await asyncio.wait_for(
                    queue.get(), timeout=app.state.settings.websocket_heartbeat_seconds
                )
                await websocket.send_json(event)
            except TimeoutError:
                await websocket.send_json(
                    {
                        "sequence": int(latest or 0),
                        "topic": topic,
                        "type": "heartbeat",
                        "payload": {},
                    }
                )


@router.websocket("/ws/markets")
async def markets_socket(websocket: WebSocket) -> None:
    try:
        await _socket_loop(websocket, "markets")
    except WebSocketDisconnect:
        return


@router.websocket("/ws/portfolio")
async def portfolio_socket(websocket: WebSocket) -> None:
    try:
        await _socket_loop(websocket, "portfolio")
    except WebSocketDisconnect:
        return


@router.websocket("/ws/simulation")
async def simulation_socket(websocket: WebSocket) -> None:
    try:
        await _socket_loop(websocket, "simulation")
    except WebSocketDisconnect:
        return
