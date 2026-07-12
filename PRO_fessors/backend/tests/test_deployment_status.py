from __future__ import annotations

from typing import Any

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app
from app.services.blockfrost import BlockfrostUpstreamError


class StubBlockfrostClient:
    def __init__(self, result: bool | Exception) -> None:
        self.result = result
        self.calls: list[str] = []

    async def address_observed(self, address: str) -> bool:
        self.calls.append(address)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def _script(body: dict[str, Any], name: str) -> dict[str, Any]:
    return next(item for item in body["scripts"] if item["script"] == name)


async def _status(
    settings: Settings,
    blockfrost_client: StubBlockfrostClient,
) -> tuple[dict[str, Any], str]:
    application = create_app(settings, blockfrost_client=blockfrost_client)
    async with LifespanManager(application):
        async with AsyncClient(
            transport=ASGITransport(app=application), base_url="http://testserver"
        ) as client:
            response = await client.get("/deployment/status")
    assert response.status_code == 200
    return response.json(), response.text


@pytest.mark.asyncio
async def test_deployment_status_reports_unconfigured_without_query(client) -> None:
    response = await client.get("/deployment/status")

    assert response.status_code == 200
    body = response.json()
    assert body["network"] == "preprod"
    assert body["admin_payment_credential"] == "demo-admin"
    assert body["blockfrost_query_configured"] is False
    assert [item["script"] for item in body["scripts"]] == [
        "market_lifecycle",
        "market",
        "market_settlement",
        "liquidity",
        "position",
    ]
    assert all(item["configured"] is False for item in body["scripts"])
    assert all(item["observation_status"] == "NOT_CONFIGURED" for item in body["scripts"])
    assert all(item["observed"] is None for item in body["scripts"])


@pytest.mark.asyncio
async def test_deployment_status_reports_observed_address(settings) -> None:
    secret = "preprod-secret-must-never-be-returned"
    configured = settings.model_copy(
        update={
            "blockfrost_project_id": secret,
            "market_lifecycle_script_address": "addr_test1lifecycle",
        }
    )
    stub = StubBlockfrostClient(True)

    body, raw_response = await _status(configured, stub)

    lifecycle = _script(body, "market_lifecycle")
    assert lifecycle["configured"] is True
    assert lifecycle["observation_status"] == "OBSERVED"
    assert lifecycle["observed"] is True
    assert stub.calls == ["addr_test1lifecycle"]
    assert secret not in raw_response


@pytest.mark.asyncio
async def test_deployment_status_reports_not_observed_address(settings) -> None:
    configured = settings.model_copy(
        update={
            "blockfrost_project_id": "test-project-id",
            "market_settlement_script_address": "addr_test1settlement",
        }
    )
    stub = StubBlockfrostClient(False)

    body, _ = await _status(configured, stub)

    settlement = _script(body, "market_settlement")
    assert settlement["configured"] is True
    assert settlement["observation_status"] == "NOT_OBSERVED"
    assert settlement["observed"] is False
    assert stub.calls == ["addr_test1settlement"]


@pytest.mark.asyncio
async def test_deployment_status_keeps_upstream_failure_unknown(settings) -> None:
    configured = settings.model_copy(
        update={
            "blockfrost_project_id": "test-project-id",
            "position_script_address": "addr_test1position",
        }
    )
    stub = StubBlockfrostClient(BlockfrostUpstreamError("synthetic upstream failure"))

    body, raw_response = await _status(configured, stub)

    position = _script(body, "position")
    assert position["configured"] is True
    assert position["observation_status"] == "UNKNOWN"
    assert position["observed"] is None
    assert "query failed" in position["detail"]
    assert "synthetic upstream failure" not in raw_response
