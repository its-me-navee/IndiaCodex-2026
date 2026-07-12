from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.domain import MarketStatus
from app.models import Market

MARKET_ID = "70000000-0000-4000-8000-000000000001"


async def _create_closed_market(app) -> None:
    now = datetime.now(UTC)
    async with app.state.database.session_factory() as session:
        session.add(
            Market(
                id=MARKET_ID,
                slug="single-admin-resolution-test",
                creator_payment_credential="market-creator",
                statement="Will the single-admin resolution test finish successfully?",
                category="Test",
                trading_deadline=now - timedelta(minutes=5),
                resolution_deadline=now + timedelta(days=1),
                yes_criteria="YES if the deterministic integration test succeeds.",
                primary_source="https://example.test/result",
                backup_source=None,
                invalid_market_rule="VOID if the deterministic result cannot be observed.",
                terms_hash="a" * 64,
                status=MarketStatus.CLOSED.value,
            )
        )
        await session.commit()


@pytest.mark.asyncio
async def test_resolution_requires_configured_admin_and_one_signer(app, client) -> None:
    await _create_closed_market(app)
    request_body = {
        "outcome": "YES",
        "evidence_uri": "https://example.test/result",
        "admin_payment_credential": "demo-admin",
    }

    non_admin = await client.post(
        f"/markets/{MARKET_ID}/resolution-payload",
        headers={"X-Demo-Wallet": "demo-alice"},
        json=request_body,
    )
    assert non_admin.status_code == 403
    assert non_admin.json()["detail"] == "admin wallet required"

    mismatch = await client.post(
        f"/markets/{MARKET_ID}/resolution-payload",
        headers={"X-Admin-Key": "test-admin-key"},
        json={**request_body, "admin_payment_credential": "different-admin"},
    )
    assert mismatch.status_code == 403
    assert "configured admin wallet" in mismatch.json()["detail"]

    response = await client.post(
        f"/markets/{MARKET_ID}/resolution-payload",
        headers={"X-Admin-Key": "test-admin-key"},
        json=request_body,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "UNSIGNED"
    assert payload["requires_wallet_signature"] is True
    assert payload["parameters"]["admin_payment_credential"] == "demo-admin"
    assert payload["parameters"]["resolver_key_hashes"] == ["demo-admin"]
    assert payload["parameters"]["resolver_threshold"] == 1
    assert payload["parameters"]["required_signer_count"] == 1
    assert payload["parameters"]["admin_signature_required"] is True
    assert payload["parameters"]["backend_can_sign"] is False
    assert payload["parameters"]["backend_can_spend_wallet"] is False


@pytest.mark.asyncio
async def test_resolution_rejects_old_multi_resolver_payload(app, client) -> None:
    await _create_closed_market(app)
    response = await client.post(
        f"/markets/{MARKET_ID}/resolution-payload",
        headers={"X-Admin-Key": "test-admin-key"},
        json={
            "outcome": "YES",
            "evidence_uri": "https://example.test/result",
            "resolver_signatures": [
                {"payment_credential": "resolver-one"},
                {"payment_credential": "resolver-two"},
            ],
        },
    )

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any(error["loc"][-1] == "admin_payment_credential" for error in errors)
    assert any(error["loc"][-1] == "resolver_signatures" for error in errors)
