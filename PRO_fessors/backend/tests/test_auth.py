from __future__ import annotations

import pytest

from tests.cip8_helpers import sign_cip8, signing_identity


@pytest.mark.asyncio
async def test_real_cip8_login_consumes_challenge_once(client) -> None:
    private_key, address, raw_address = signing_identity(network_id=0)
    challenge_response = await client.post(
        "/auth/challenge", json={"address": address, "network": "preprod"}
    )
    assert challenge_response.status_code == 201
    challenge = challenge_response.json()
    cose_sign1, cose_key = sign_cip8(private_key, raw_address, challenge["message"])

    verification = await client.post(
        "/auth/verify",
        json={
            "challenge_id": challenge["challenge_id"],
            "address": address,
            "cose_sign1": cose_sign1,
            "cose_key": cose_key,
        },
    )
    assert verification.status_code == 200
    body = verification.json()
    assert body["auth_mode"] == "cip8"
    assert body["wallet"]["network"] == "preprod"
    assert len(body["wallet"]["payment_credential"]) == 56
    assert body["access_token"]

    replay = await client.post(
        "/auth/verify",
        json={
            "challenge_id": challenge["challenge_id"],
            "address": address,
            "cose_sign1": cose_sign1,
            "cose_key": cose_key,
        },
    )
    assert replay.status_code == 409


@pytest.mark.asyncio
async def test_cip8_rejects_forgery_and_wrong_network(client) -> None:
    private_key, address, raw_address = signing_identity(network_id=0)
    challenge = (
        await client.post("/auth/challenge", json={"address": address, "network": "preprod"})
    ).json()
    cose_sign1, cose_key = sign_cip8(private_key, raw_address, challenge["message"])
    forged = cose_sign1[:-2] + ("00" if cose_sign1[-2:] != "00" else "01")
    response = await client.post(
        "/auth/verify",
        json={
            "challenge_id": challenge["challenge_id"],
            "address": address,
            "cose_sign1": forged,
            "cose_key": cose_key,
        },
    )
    assert response.status_code == 401

    mainnet_key, mainnet_address, mainnet_raw = signing_identity(network_id=1)
    mainnet_challenge = (
        await client.post(
            "/auth/challenge", json={"address": mainnet_address, "network": "preprod"}
        )
    ).json()
    mainnet_sign1, mainnet_cose_key = sign_cip8(
        mainnet_key, mainnet_raw, mainnet_challenge["message"]
    )
    wrong_network = await client.post(
        "/auth/verify",
        json={
            "challenge_id": mainnet_challenge["challenge_id"],
            "address": mainnet_address,
            "cose_sign1": mainnet_sign1,
            "cose_key": mainnet_cose_key,
        },
    )
    assert wrong_network.status_code == 401
    assert "wrong Cardano network" in wrong_network.json()["detail"]


@pytest.mark.asyncio
async def test_demo_fallback_is_explicitly_labeled(client) -> None:
    challenge = (
        await client.post(
            "/auth/challenge", json={"address": "demo-address-123", "network": "preprod"}
        )
    ).json()
    assert challenge["demo_fallback_enabled"] is True
    assert challenge["demo_warning"]
    response = await client.post(
        "/auth/verify",
        json={
            "challenge_id": challenge["challenge_id"],
            "address": "demo-address-123",
            "demo_signature": challenge["demo_signature"],
        },
    )
    assert response.status_code == 200
    assert response.json()["auth_mode"] == "demo"
    assert "not cryptographic" in response.json()["demo_warning"]
