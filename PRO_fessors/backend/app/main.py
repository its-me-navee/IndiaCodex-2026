from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app.api.router import router
from app.config import Settings, get_settings
from app.db import Database
from app.seed import seed_demo_data
from app.services.blockfrost import AsyncBlockfrostClient, HttpBlockfrostClient
from app.websocket import WebSocketHub


def create_app(
    settings: Settings | None = None,
    *,
    blockfrost_client: AsyncBlockfrostClient | None = None,
) -> FastAPI:
    configured = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        database = Database(configured.database_url, echo=configured.debug)
        application.state.database = database
        application.state.settings = configured
        application.state.websocket_hub = WebSocketHub()
        owned_blockfrost_client: HttpBlockfrostClient | None = None
        if blockfrost_client is not None:
            application.state.blockfrost_client = blockfrost_client
        elif configured.blockfrost_project_id:
            owned_blockfrost_client = HttpBlockfrostClient(
                base_url=configured.blockfrost_base_url,
                project_id=configured.blockfrost_project_id,
            )
            application.state.blockfrost_client = owned_blockfrost_client
        else:
            application.state.blockfrost_client = None
        application.state.redis = (
            Redis.from_url(
                configured.redis_url,
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
            )
            if configured.redis_url
            else None
        )
        if configured.auto_create_schema:
            await database.create_schema()
            if configured.seed_demo_data:
                await seed_demo_data(database, configured)
        yield
        if application.state.redis is not None:
            await application.state.redis.aclose()
        if owned_blockfrost_client is not None:
            await owned_blockfrost_client.aclose()
        await database.dispose()

    application = FastAPI(
        title=configured.app_name,
        version="0.1.0",
        description=(
            "Testnet-only ProbX API. Transaction routes return unsigned building parameters and "
            "never claim submission or confirmation."
        ),
        lifespan=lifespan,
    )
    application.state.settings = configured
    origins = configured.allowed_origins or []
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials="*" not in origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(router)
    return application


app = create_app()
