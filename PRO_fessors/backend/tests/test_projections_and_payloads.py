from __future__ import annotations

import pytest
from sqlalchemy import select

from app.domain import ChainTransactionStatus
from app.models import ChainTransaction
from app.seed import SIMULATION_MARKET_ID


@pytest.mark.asyncio
async def test_health_liquidity_portfolio_leaderboard_and_simulation(client) -> None:
    health = await client.get("/health")
    assert health.status_code == 200
    assert health.json()["network"] == "preprod"
    assert health.json()["testnet_only"] is True

    liquidity = await client.get(f"/markets/{SIMULATION_MARKET_ID}/liquidity")
    assert liquidity.status_code == 200
    projection = liquidity.json()
    assert projection["contributed_liquidity_lovelace"] == 180_000_000
    assert projection["lp_principal_protected"] is False
    assert projection["provider_count"] == 3
    assert "source of truth" in projection["projection_notice"]

    portfolio = await client.get("/portfolio", headers={"X-Demo-Wallet": "demo-alice"})
    assert portfolio.status_code == 200
    assert len(portfolio.json()["positions"]) == 2
    assert all(item["is_simulated"] for item in portfolio.json()["positions"])
    assert "not wallet value" in portfolio.json()["estimate_notice"]

    leaderboard = await client.get("/leaderboard")
    assert leaderboard.status_code == 200
    assert leaderboard.json()["excludes_simulation"] is True
    assert leaderboard.json()["entries"] == []

    simulation = await client.get("/simulation/status")
    assert simulation.status_code == 200
    body = simulation.json()
    assert body["virtual_personas"] == 10_000
    assert body["off_chain"] is True
    assert body["real_preprod_transactions"] == 0
    assert "not 10,000 people" in body["disclosure"]


@pytest.mark.asyncio
async def test_transaction_payload_never_claims_submission_or_confirmation(app, client) -> None:
    response = await client.post(
        f"/markets/{SIMULATION_MARKET_ID}/position-payload",
        headers={"X-Demo-Wallet": "demo-alice"},
        json={"outcome": "YES", "amount_lovelace": 5_000_000},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "UNSIGNED"
    assert payload["chain_status"] == "NOT_SUBMITTED"
    assert payload["confirmation_status"] == "NOT_OBSERVED"
    assert payload["requires_wallet_signature"] is True
    assert payload["parameters"]["backend_can_sign"] is False
    assert payload["parameters"]["backend_can_spend_wallet"] is False
    assert "has not submitted or confirmed" in payload["warning"]

    async with app.state.database.session_factory() as session:
        record = await session.scalar(
            select(ChainTransaction).where(ChainTransaction.id == payload["payload_id"])
        )
        assert record is not None
        assert record.status == ChainTransactionStatus.NOT_SUBMITTED.value
        assert record.tx_hash is None
        assert record.confirmed_at is None
