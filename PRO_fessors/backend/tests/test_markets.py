from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.auth.cip8 import demo_signature_for
from app.domain import MarketStatus
from app.models import Market
from app.seed import REAL_MARKET_ID, SIMULATION_MARKET_ID
from app.services.commitments import forecast_message, terms_hash


@pytest.mark.asyncio
async def test_seeded_market_contract_and_exactly_100_forecasts(client) -> None:
    response = await client.get("/markets")
    assert response.status_code == 200
    items = response.json()["items"]
    required_fields = {
        "id",
        "statement",
        "category",
        "status",
        "opening_forecast_count",
        "yes_probability",
        "liquidity_lovelace",
        "volume_lovelace",
        "trading_deadline",
        "resolution_deadline",
    }
    assert required_fields <= set(items[0])

    market = (await client.get(f"/markets/{SIMULATION_MARKET_ID}")).json()
    assert market["opening_forecast_count"] == 100
    assert market["opening_yes_count"] == 64
    assert market["opening_no_count"] == 36
    assert market["yes_probability"] == 64
    assert len(market["opening_poll_root"]) == 64
    assert market["is_simulation"] is True

    forecasts = (await client.get(f"/markets/{SIMULATION_MARKET_ID}/opening-forecasts")).json()
    assert forecasts["count"] == 100
    assert len(forecasts["forecasts"]) == 100
    assert all(item["verification_mode"] == "simulation" for item in forecasts["forecasts"])


@pytest.mark.asyncio
async def test_structured_draft_admin_review_creates_price_discovery_market(client) -> None:
    now = datetime.now(UTC)
    created = await client.post(
        "/market-drafts",
        headers={"X-Demo-Wallet": "draft-creator"},
        json={
            "statement": "Will Cardano governance participation exceed 60% by December 2026?",
            "category": "Governance",
            "trading_deadline": (now + timedelta(days=40)).isoformat(),
            "resolution_deadline": (now + timedelta(days=47)).isoformat(),
            "yes_criteria": (
                "YES if the official governance dashboard reports participation above 60 percent."
            ),
            "primary_source": "https://gov.tools/",
            "backup_source": "https://cardano.org/",
            "invalid_market_rule": "VOID if neither official source publishes the final metric.",
        },
    )
    assert created.status_code == 201
    draft = created.json()
    assert draft["status"] == "PENDING"
    assert draft["market_id"] is None

    reviewed = await client.post(
        f"/market-drafts/{draft['id']}/review",
        headers={"X-Admin-Key": "test-admin-key"},
        json={
            "decision": "APPROVED",
            "review_note": "Objective source and boundary accepted.",
            "normalized_statement": (
                "Will Cardano governance participation exceed 60% before 1 December 2026?"
            ),
            "minimum_liquidity_lovelace": 125_000_000,
        },
    )
    assert reviewed.status_code == 200
    body = reviewed.json()
    assert body["status"] == "APPROVED"
    assert body["market_id"]
    market = (await client.get(f"/markets/{body['market_id']}")).json()
    assert market["status"] == "PRICE_DISCOVERY"
    assert market["minimum_liquidity_lovelace"] == 125_000_000


@pytest.mark.asyncio
async def test_ordinary_market_rejects_demo_forecast(client) -> None:
    message = forecast_message(REAL_MARKET_ID, "demo-wallet", "YES")
    response = await client.post(
        f"/markets/{REAL_MARKET_ID}/opening-forecasts",
        headers={"X-Demo-Wallet": "demo-wallet"},
        json={"outcome": "YES", "demo_signature": demo_signature_for(message)},
    )
    assert response.status_code == 401
    assert "ordinary markets require CIP-8" in response.json()["detail"]


@pytest.mark.asyncio
async def test_unique_100_forecast_completion_and_unanimous_bound(app, client) -> None:
    market_id = "60000000-0000-4000-8000-000000000001"
    now = datetime.now(UTC)
    async with app.state.database.session_factory() as session:
        session.add(
            Market(
                id=market_id,
                slug="unanimous-simulation-test",
                creator_payment_credential="sim-test-creator",
                statement="Will this disclosed simulation produce one hundred YES forecasts?",
                category="Simulation",
                trading_deadline=now + timedelta(days=2),
                resolution_deadline=now + timedelta(days=3),
                yes_criteria="YES if all deterministic test personas select YES.",
                primary_source="https://example.test/simulation",
                backup_source=None,
                invalid_market_rule="VOID if the deterministic fixture cannot be reproduced.",
                terms_hash=terms_hash({"fixture": "unanimous"}),
                status=MarketStatus.PRICE_DISCOVERY.value,
                is_simulation=True,
                minimum_liquidity_lovelace=100_000_000,
            )
        )
        await session.commit()

    first_message = forecast_message(market_id, "persona-000", "YES")
    first_payload = {
        "outcome": "YES",
        "demo_signature": demo_signature_for(first_message),
    }
    first = await client.post(
        f"/markets/{market_id}/opening-forecasts",
        headers={"X-Demo-Wallet": "persona-000"},
        json=first_payload,
    )
    assert first.status_code == 201
    duplicate = await client.post(
        f"/markets/{market_id}/opening-forecasts",
        headers={"X-Demo-Wallet": "persona-000"},
        json=first_payload,
    )
    assert duplicate.status_code == 409

    for index in range(1, 100):
        credential = f"persona-{index:03d}"
        message = forecast_message(market_id, credential, "YES")
        response = await client.post(
            f"/markets/{market_id}/opening-forecasts",
            headers={"X-Demo-Wallet": credential},
            json={"outcome": "YES", "demo_signature": demo_signature_for(message)},
        )
        assert response.status_code == 201, response.text

    market = (await client.get(f"/markets/{market_id}")).json()
    assert market["opening_forecast_count"] == 100
    assert market["yes_probability"] == 99
    assert market["status"] == "FUNDING"
    assert len(market["opening_poll_root"]) == 64
