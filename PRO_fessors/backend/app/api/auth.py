from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.cip8 import (
    CIP8VerificationError,
    demo_payment_credential,
    demo_signature_for,
    verify_cip8_signature,
)
from app.auth.session import Principal, issue_session_token
from app.db import get_session
from app.domain import AuthMode
from app.models import Wallet, WalletChallenge
from app.schemas import (
    ChallengeRequest,
    ChallengeResponse,
    VerifyRequest,
    VerifyResponse,
    WalletIdentity,
)

router = APIRouter(prefix="/auth", tags=["authentication"])
Session = Annotated[AsyncSession, Depends(get_session)]


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


@router.post("/challenge", response_model=ChallengeResponse, status_code=status.HTTP_201_CREATED)
async def create_challenge(
    payload: ChallengeRequest, session: Session, request: Request
) -> ChallengeResponse:
    settings = request.app.state.settings
    if payload.network != settings.cardano_network:
        raise HTTPException(status_code=400, detail="wrong Cardano network; ProbX uses preprod")
    now = datetime.now(UTC)
    expires_at = now + timedelta(seconds=settings.challenge_ttl_seconds)
    nonce = secrets.token_urlsafe(32)
    message = json.dumps(
        {
            "action": "PROBX_WALLET_LOGIN",
            "address": payload.address,
            "domain": settings.auth_domain,
            "expires_at": expires_at.isoformat(),
            "issued_at": now.isoformat(),
            "network": "preprod",
            "nonce": nonce,
            "spending_authorization": False,
            "version": 1,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    challenge = WalletChallenge(
        address=payload.address,
        network=payload.network,
        nonce_hash=hashlib.sha256(nonce.encode()).hexdigest(),
        message=message,
        issued_at=now,
        expires_at=expires_at,
    )
    session.add(challenge)
    await session.commit()
    return ChallengeResponse(
        challenge_id=challenge.id,
        message=message,
        expires_at=expires_at,
        demo_fallback_enabled=settings.allow_demo_auth,
        demo_signature=demo_signature_for(message) if settings.allow_demo_auth else None,
        demo_warning=(
            "Insecure local-demo proof. It is accepted only because PROBX_ALLOW_DEMO_AUTH=true."
            if settings.allow_demo_auth
            else None
        ),
    )


@router.post("/verify", response_model=VerifyResponse)
async def verify_challenge(
    payload: VerifyRequest, session: Session, request: Request
) -> VerifyResponse:
    settings = request.app.state.settings
    challenge = await session.scalar(
        select(WalletChallenge).where(WalletChallenge.id == payload.challenge_id).with_for_update()
    )
    if challenge is None or not hmac.compare_digest(challenge.address, payload.address):
        raise HTTPException(status_code=401, detail="unknown challenge or address mismatch")
    if challenge.network != settings.cardano_network:
        raise HTTPException(status_code=401, detail="challenge was issued for the wrong network")
    if challenge.consumed_at is not None:
        raise HTTPException(status_code=409, detail="challenge has already been consumed")
    if _aware(challenge.expires_at) <= datetime.now(UTC):
        raise HTTPException(status_code=401, detail="challenge has expired")

    auth_mode: AuthMode
    if payload.cose_sign1 and payload.cose_key:
        try:
            result = verify_cip8_signature(
                address=payload.address,
                expected_message=challenge.message,
                cose_sign1_hex=payload.cose_sign1,
                cose_key_hex=payload.cose_key,
                expected_network_id=settings.cardano_network_id,
            )
        except CIP8VerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        payment_credential = result.payment_credential
        auth_mode = AuthMode.CIP8
    elif (
        settings.allow_demo_auth
        and payload.demo_signature
        and hmac.compare_digest(payload.demo_signature, demo_signature_for(challenge.message))
    ):
        payment_credential = demo_payment_credential(payload.address)
        auth_mode = AuthMode.DEMO
    else:
        raise HTTPException(
            status_code=401,
            detail="valid CIP-8 proof required (or explicit local-demo mode must be enabled)",
        )

    wallet = await session.scalar(
        select(Wallet).where(
            or_(
                Wallet.payment_credential == payment_credential,
                Wallet.address == payload.address,
            )
        )
    )
    if wallet is None:
        wallet = Wallet(
            payment_credential=payment_credential,
            address=payload.address,
            network="preprod",
            auth_mode=auth_mode.value,
        )
        session.add(wallet)
    else:
        wallet.payment_credential = payment_credential
        wallet.address = payload.address
        wallet.auth_mode = auth_mode.value
    wallet.last_authenticated_at = datetime.now(UTC)
    challenge.consumed_at = datetime.now(UTC)
    await session.commit()

    principal = Principal(
        payment_credential=payment_credential,
        address=payload.address,
        network="preprod",
        auth_mode=auth_mode,
    )
    return VerifyResponse(
        access_token=issue_session_token(principal, settings),
        expires_in=settings.session_ttl_seconds,
        wallet=WalletIdentity(
            address=payload.address,
            payment_credential=payment_credential,
            network="preprod",
        ),
        auth_mode=auth_mode.value,
        demo_warning=(
            "Demo authentication is not cryptographic wallet ownership proof."
            if auth_mode is AuthMode.DEMO
            else None
        ),
    )
