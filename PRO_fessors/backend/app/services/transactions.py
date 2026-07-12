from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.domain import ChainTransactionStatus, TransactionIntent
from app.models import ChainTransaction
from app.schemas import UnsignedTransactionPayload
from app.services.commitments import canonical_json, sha256_hex


async def create_unsigned_payload(
    session: AsyncSession,
    *,
    settings: Settings,
    intent: TransactionIntent,
    market_id: str | None,
    submitted_by: str | None,
    parameters: dict[str, Any],
) -> UnsignedTransactionPayload:
    payload_id = str(uuid.uuid4())
    expires_at = datetime.now(UTC) + timedelta(seconds=settings.payload_ttl_seconds)
    safe_parameters = {
        **parameters,
        "network": "preprod",
        "backend_can_sign": False,
        "backend_can_spend_wallet": False,
        "requires_cip30_wallet_signature": True,
        "state_projection_only": True,
    }
    payload_hash = sha256_hex(
        canonical_json(
            {
                "expires_at": expires_at.isoformat(),
                "intent": intent.value,
                "market_id": market_id,
                "parameters": safe_parameters,
                "payload_id": payload_id,
                "submitted_by": submitted_by,
            }
        )
    )
    session.add(
        ChainTransaction(
            id=payload_id,
            tx_hash=None,
            intent=intent.value,
            market_id=market_id,
            submitted_by=submitted_by,
            status=ChainTransactionStatus.NOT_SUBMITTED.value,
            payload_hash=payload_hash,
            parameters=safe_parameters,
        )
    )
    await session.flush()
    return UnsignedTransactionPayload(
        payload_id=payload_id,
        payload_hash=payload_hash,
        intent=intent.value,
        market_id=market_id,
        expires_at=expires_at,
        parameters=safe_parameters,
    )
