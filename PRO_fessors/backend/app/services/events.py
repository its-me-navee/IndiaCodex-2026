from __future__ import annotations

import json
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OutboxEvent


async def add_outbox_event(
    session: AsyncSession,
    *,
    topic: str,
    event_type: str,
    aggregate_id: str | None,
    payload: dict[str, Any],
) -> OutboxEvent:
    event = OutboxEvent(
        topic=topic,
        event_type=event_type,
        aggregate_id=aggregate_id,
        payload=payload,
    )
    session.add(event)
    await session.flush()
    return event


def event_message(event: OutboxEvent) -> dict[str, Any]:
    return {
        "sequence": event.id,
        "topic": event.topic,
        "type": event.event_type,
        "aggregate_id": event.aggregate_id,
        "payload": event.payload,
        "created_at": event.created_at.isoformat(),
    }


async def publish_committed_event(request: Request, event: OutboxEvent) -> None:
    message = event_message(event)
    await request.app.state.websocket_hub.publish(event.topic, message)
    redis = getattr(request.app.state, "redis", None)
    if redis is not None:
        try:
            await redis.publish(f"probx:{event.topic}", json.dumps(message))
        except Exception:  # Redis is replaceable; the durable outbox remains authoritative.
            return
