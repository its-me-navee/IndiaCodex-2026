from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Literal, cast

from fastapi import APIRouter, Request

from app.schemas import DeploymentStatusResponse, ScriptDeploymentStatus
from app.services.blockfrost import AsyncBlockfrostClient, BlockfrostUpstreamError

router = APIRouter(prefix="/deployment", tags=["deployment"])

ScriptName = Literal[
    "market_lifecycle",
    "market",
    "market_settlement",
    "liquidity",
    "position",
]


async def _script_status(
    *,
    script: ScriptName,
    address: str | None,
    blockfrost_query_configured: bool,
    client: AsyncBlockfrostClient | None,
) -> ScriptDeploymentStatus:
    if address is None:
        return ScriptDeploymentStatus(
            script=script,
            address=None,
            configured=False,
            observation_status="NOT_CONFIGURED",
            observed=None,
            detail="No script address is configured.",
        )
    if not blockfrost_query_configured or client is None:
        return ScriptDeploymentStatus(
            script=script,
            address=address,
            configured=True,
            observation_status="UNKNOWN",
            observed=None,
            detail="Blockfrost querying is not configured; chain observation is unknown.",
        )
    try:
        observed = await client.address_observed(address)
    except BlockfrostUpstreamError:
        return ScriptDeploymentStatus(
            script=script,
            address=address,
            configured=True,
            observation_status="UNKNOWN",
            observed=None,
            detail="Blockfrost query failed; chain observation is unknown.",
        )
    except Exception:
        return ScriptDeploymentStatus(
            script=script,
            address=address,
            configured=True,
            observation_status="UNKNOWN",
            observed=None,
            detail="Blockfrost query failed; chain observation is unknown.",
        )

    return ScriptDeploymentStatus(
        script=script,
        address=address,
        configured=True,
        observation_status="OBSERVED" if observed else "NOT_OBSERVED",
        observed=observed,
        detail=(
            "Blockfrost found address transaction history."
            if observed
            else "Blockfrost found no address transaction history."
        ),
    )


@router.get("/status", response_model=DeploymentStatusResponse)
async def deployment_status(request: Request) -> DeploymentStatusResponse:
    settings = request.app.state.settings
    client = cast(
        AsyncBlockfrostClient | None,
        getattr(request.app.state, "blockfrost_client", None),
    )
    query_configured = bool(settings.blockfrost_project_id and client is not None)
    script_inputs: list[tuple[ScriptName, str | None]] = [
        ("market_lifecycle", settings.market_lifecycle_script_address),
        ("market", settings.market_script_address),
        ("market_settlement", settings.market_settlement_script_address),
        ("liquidity", settings.liquidity_script_address),
        ("position", settings.position_script_address),
    ]
    scripts = await asyncio.gather(
        *(
            _script_status(
                script=script,
                address=address,
                blockfrost_query_configured=query_configured,
                client=client,
            )
            for script, address in script_inputs
        )
    )
    return DeploymentStatusResponse(
        network="preprod",
        admin_payment_credential=settings.admin_payment_credential,
        blockfrost_query_configured=query_configured,
        scripts=list(scripts),
        checked_at=datetime.now(UTC),
    )
