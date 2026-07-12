from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import AdminPrincipal, CurrentPrincipal
from app.auth.session import Principal
from app.db import get_session
from app.domain import MarketStatus, PositionStatus, TransactionIntent
from app.models import LiquidityContribution, Market, Position
from app.schemas import (
    CashoutPayloadRequest,
    LiquidityDepositPayloadRequest,
    LiquidityRedeemPayloadRequest,
    PositionPayloadRequest,
    ResolutionPayloadRequest,
    UnsignedTransactionPayload,
)
from app.services.transactions import create_unsigned_payload

router = APIRouter(tags=["transaction building parameters"])
Session = Annotated[AsyncSession, Depends(get_session)]


async def _market(session: AsyncSession, market_id: str) -> Market:
    market = await session.get(Market, market_id)
    if market is None:
        raise HTTPException(status_code=404, detail="market not found")
    return market


async def _build(
    session: AsyncSession,
    request: Request,
    *,
    intent: TransactionIntent,
    market_id: str | None,
    principal: Principal,
    parameters: dict[str, object],
) -> UnsignedTransactionPayload:
    result = await create_unsigned_payload(
        session,
        settings=request.app.state.settings,
        intent=intent,
        market_id=market_id,
        submitted_by=principal.payment_credential,
        parameters=parameters,
    )
    await session.commit()
    return result


@router.post("/markets/{market_id}/activation-payload", response_model=UnsignedTransactionPayload)
async def activation_payload(
    market_id: str,
    session: Session,
    principal: CurrentPrincipal,
    request: Request,
) -> UnsignedTransactionPayload:
    market = await _market(session, market_id)
    if market.creator_payment_credential != principal.payment_credential:
        raise HTTPException(status_code=403, detail="market creator signature required")
    if market.status != MarketStatus.PRICE_DISCOVERY.value:
        raise HTTPException(status_code=409, detail="market is not awaiting activation")
    return await _build(
        session,
        request,
        intent=TransactionIntent.ACTIVATE,
        market_id=market.id,
        principal=principal,
        parameters={
            "terms_hash": market.terms_hash,
            "creator_payment_credential": market.creator_payment_credential,
            "target_status": MarketStatus.PRICE_DISCOVERY.value,
            "minimum_utxo_calculation_required": True,
        },
    )


@router.post(
    "/markets/{market_id}/finalize-opening-payload", response_model=UnsignedTransactionPayload
)
async def finalize_opening_payload(
    market_id: str,
    session: Session,
    principal: AdminPrincipal,
    request: Request,
) -> UnsignedTransactionPayload:
    market = await _market(session, market_id)
    if market.opening_forecast_count != 100 or not market.opening_poll_root:
        raise HTTPException(status_code=409, detail="exactly 100 forecasts are required")
    if market.status != MarketStatus.FUNDING.value:
        raise HTTPException(status_code=409, detail="market opening is not ready to finalize")
    return await _build(
        session,
        request,
        intent=TransactionIntent.FINALIZE_OPENING,
        market_id=market.id,
        principal=principal,
        parameters={
            "opening_poll_root": market.opening_poll_root,
            "opening_yes_count": market.opening_yes_count,
            "opening_no_count": market.opening_no_count,
            "opening_yes_probability": market.yes_probability,
            "admin_payment_credential": principal.payment_credential,
            "resolver_key_hashes": [principal.payment_credential],
            "resolver_threshold": 1,
            "admin_signature_required": True,
            "is_simulation": market.is_simulation,
        },
    )


@router.post("/markets/{market_id}/position-payload", response_model=UnsignedTransactionPayload)
async def position_payload(
    market_id: str,
    payload: PositionPayloadRequest,
    session: Session,
    principal: CurrentPrincipal,
    request: Request,
) -> UnsignedTransactionPayload:
    market = await _market(session, market_id)
    if market.status != MarketStatus.TRADING.value:
        raise HTTPException(status_code=409, detail="market is not open for trading")
    if datetime.now(UTC) >= market.trading_deadline.replace(
        tzinfo=market.trading_deadline.tzinfo or UTC
    ):
        raise HTTPException(status_code=409, detail="trading deadline has passed")
    amount = payload.amount_lovelace
    fee = amount * request.app.state.settings.liquidity_fee_bps // 10_000
    probability = market.yes_probability or 50
    price_tick = probability if payload.outcome.value == "YES" else 100 - probability
    estimated_shares = max(1, (amount - fee) * 100 // max(1, price_tick))
    worst_case_after = max(
        market.yes_liability_lovelace + (estimated_shares if payload.outcome.value == "YES" else 0),
        market.no_liability_lovelace + (estimated_shares if payload.outcome.value == "NO" else 0),
    )
    locked_after = market.liquidity_lovelace + market.user_collateral_lovelace + amount
    if worst_case_after > locked_after:
        raise HTTPException(status_code=409, detail="projected trade exceeds market collateral")
    return await _build(
        session,
        request,
        intent=TransactionIntent.BUY_POSITION,
        market_id=market.id,
        principal=principal,
        parameters={
            "owner_payment_credential": principal.payment_credential,
            "outcome": payload.outcome.value,
            "amount_lovelace": amount,
            "liquidity_fee_lovelace": fee,
            "liquidity_fee_bps": 100,
            "estimated_shares": estimated_shares,
            "minimum_shares": payload.minimum_shares,
            "expected_market_state_reference": payload.expected_state_reference,
            "fresh_state_reference_required": True,
            "solvency_check_lovelace": locked_after - worst_case_after,
        },
    )


@router.post("/positions/{position_id}/cashout-payload", response_model=UnsignedTransactionPayload)
async def cashout_payload(
    position_id: str,
    payload: CashoutPayloadRequest,
    session: Session,
    principal: CurrentPrincipal,
    request: Request,
) -> UnsignedTransactionPayload:
    position = await session.get(Position, position_id)
    if position is None:
        raise HTTPException(status_code=404, detail="position not found")
    if position.owner_payment_credential != principal.payment_credential:
        raise HTTPException(status_code=403, detail="position owner signature required")
    if position.status != PositionStatus.OPEN.value:
        raise HTTPException(status_code=409, detail="only an open position can be cashed out")
    market = await _market(session, position.market_id)
    deadline = market.trading_deadline.replace(tzinfo=market.trading_deadline.tzinfo or UTC)
    if datetime.now(UTC) >= deadline:
        raise HTTPException(status_code=409, detail="cash-out deadline has passed")
    gross = position.estimated_value_lovelace
    fee = gross * request.app.state.settings.liquidity_fee_bps // 10_000
    proceeds = max(0, gross - fee)
    return await _build(
        session,
        request,
        intent=TransactionIntent.CASH_OUT,
        market_id=market.id,
        principal=principal,
        parameters={
            "position_id": position.id,
            "position_reference": position.position_reference,
            "consume_entire_position": True,
            "gross_curve_value_lovelace": gross,
            "liquidity_fee_lovelace": fee,
            "projected_proceeds_lovelace": proceeds,
            "minimum_proceeds_lovelace": payload.minimum_proceeds_lovelace,
            "expected_market_state_reference": payload.expected_state_reference,
            "fresh_state_reference_required": True,
        },
    )


@router.post("/markets/{market_id}/resolution-payload", response_model=UnsignedTransactionPayload)
async def resolution_payload(
    market_id: str,
    payload: ResolutionPayloadRequest,
    session: Session,
    principal: AdminPrincipal,
    request: Request,
) -> UnsignedTransactionPayload:
    market = await _market(session, market_id)
    if payload.outcome.value == "VOID":
        raise HTTPException(status_code=422, detail="use the permissionless void-payload endpoint")
    deadline = market.trading_deadline.replace(tzinfo=market.trading_deadline.tzinfo or UTC)
    if datetime.now(UTC) < deadline:
        raise HTTPException(status_code=409, detail="market cannot resolve before trading ends")
    if market.status not in {MarketStatus.CLOSED.value, MarketStatus.TRADING.value}:
        raise HTTPException(status_code=409, detail="market is not awaiting resolution")
    if payload.admin_payment_credential != principal.payment_credential:
        raise HTTPException(
            status_code=403,
            detail="resolution signer must be the configured admin wallet",
        )
    return await _build(
        session,
        request,
        intent=TransactionIntent.RESOLVE,
        market_id=market.id,
        principal=principal,
        parameters={
            "outcome": payload.outcome.value,
            "evidence_uri": payload.evidence_uri,
            "admin_payment_credential": principal.payment_credential,
            "resolver_key_hashes": [principal.payment_credential],
            "resolver_threshold": 1,
            "required_signer_count": 1,
            "admin_signature_required": True,
        },
    )


@router.post("/markets/{market_id}/void-payload", response_model=UnsignedTransactionPayload)
async def void_payload(
    market_id: str,
    session: Session,
    principal: CurrentPrincipal,
    request: Request,
) -> UnsignedTransactionPayload:
    market = await _market(session, market_id)
    deadline = market.resolution_deadline.replace(tzinfo=market.resolution_deadline.tzinfo or UTC)
    if datetime.now(UTC) < deadline:
        raise HTTPException(status_code=409, detail="permissionless VOID is not available yet")
    if market.status in {MarketStatus.RESOLVED.value, MarketStatus.VOIDED.value}:
        raise HTTPException(status_code=409, detail="market is already terminal")
    return await _build(
        session,
        request,
        intent=TransactionIntent.VOID,
        market_id=market.id,
        principal=principal,
        parameters={
            "outcome": "VOID",
            "resolution_deadline": market.resolution_deadline.isoformat(),
            "permissionless_after_timeout": True,
        },
    )


@router.post(
    "/markets/{market_id}/liquidity/deposit-payload", response_model=UnsignedTransactionPayload
)
async def liquidity_deposit_payload(
    market_id: str,
    payload: LiquidityDepositPayloadRequest,
    session: Session,
    principal: CurrentPrincipal,
    request: Request,
) -> UnsignedTransactionPayload:
    market = await _market(session, market_id)
    if market.status != MarketStatus.FUNDING.value:
        raise HTTPException(status_code=409, detail="liquidity deposits close when trading opens")
    projected_units = payload.amount_lovelace
    return await _build(
        session,
        request,
        intent=TransactionIntent.LIQUIDITY_DEPOSIT,
        market_id=market.id,
        principal=principal,
        parameters={
            "owner_payment_credential": principal.payment_credential,
            "amount_lovelace": payload.amount_lovelace,
            "projected_lp_units": projected_units,
            "receipt_bound_to_market": market.id,
            "principal_protected": False,
            "locked_until_terminal_settlement": True,
        },
    )


@router.post(
    "/markets/{market_id}/liquidity/redeem-payload", response_model=UnsignedTransactionPayload
)
async def liquidity_redeem_payload(
    market_id: str,
    payload: LiquidityRedeemPayloadRequest,
    session: Session,
    principal: CurrentPrincipal,
    request: Request,
) -> UnsignedTransactionPayload:
    market = await _market(session, market_id)
    if market.status not in {MarketStatus.RESOLVED.value, MarketStatus.VOIDED.value}:
        raise HTTPException(status_code=409, detail="LP receipts remain locked until settlement")
    contribution = await session.scalar(
        select(LiquidityContribution).where(
            LiquidityContribution.market_id == market.id,
            LiquidityContribution.owner_payment_credential == principal.payment_credential,
            LiquidityContribution.receipt_reference == payload.receipt_reference,
            LiquidityContribution.is_confirmed.is_(True),
        )
    )
    if contribution is None:
        raise HTTPException(
            status_code=404, detail="confirmed market-specific LP receipt not found"
        )
    return await _build(
        session,
        request,
        intent=TransactionIntent.LIQUIDITY_REDEEM,
        market_id=market.id,
        principal=principal,
        parameters={
            "receipt_reference": contribution.receipt_reference,
            "lp_units": contribution.lp_units,
            "redeem_entire_receipt": True,
            "pro_rata_terminal_value_calculated_on_chain": True,
        },
    )
