from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        environment="test",
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'probx-test.db'}",
        redis_url=None,
        allowed_origins=["http://test-ui.local"],
        auto_create_schema=True,
        seed_demo_data=True,
        allow_demo_auth=True,
        auth_secret="tests-only-secret-with-more-than-32-characters",
        demo_admin_key="test-admin-key",
        admin_payment_credential="demo-admin",
    )


@pytest.fixture
async def app(settings: Settings):
    application = create_app(settings)
    async with LifespanManager(application):
        yield application


@pytest.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as test_client:
        yield test_client
