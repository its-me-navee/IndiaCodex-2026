from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_market_websocket_starts_with_monotonic_snapshot_instruction(tmp_path: Path) -> None:
    settings = Settings(
        environment="test",
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'websocket.db'}",
        redis_url=None,
        auto_create_schema=True,
        seed_demo_data=True,
        allow_demo_auth=True,
        auth_secret="tests-only-secret-with-more-than-32-characters",
    )
    with TestClient(create_app(settings)) as client:
        with client.websocket_connect("/ws/markets") as websocket:
            message = websocket.receive_json()
            assert message["topic"] == "markets"
            assert message["type"] == "ready"
            assert isinstance(message["sequence"], int)
            assert "REST snapshot" in message["payload"]["instruction"]
