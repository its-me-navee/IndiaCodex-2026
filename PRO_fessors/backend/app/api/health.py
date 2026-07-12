from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Request
from sqlalchemy import text

from app.schemas import HealthComponent, HealthResponse

router = APIRouter(tags=["operations"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    database_component = HealthComponent(status="up")
    try:
        async with request.app.state.database.session_factory() as session:
            await session.execute(text("SELECT 1"))
    except Exception as exc:
        database_component = HealthComponent(status="down", detail=type(exc).__name__)

    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is None:
        redis_component = HealthComponent(status="disabled", detail="Redis URL not configured")
    else:
        try:
            await redis_client.ping()
            redis_component = HealthComponent(status="up")
        except Exception as exc:
            redis_component = HealthComponent(status="down", detail=type(exc).__name__)

    is_degraded = database_component.status == "down" or redis_component.status == "down"
    settings = request.app.state.settings
    return HealthResponse(
        status="degraded" if is_degraded else "ok",
        service=settings.app_name,
        environment=settings.environment,
        network="preprod",
        database=database_component,
        redis=redis_component,
        timestamp=datetime.now(UTC),
    )
