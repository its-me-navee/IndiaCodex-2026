from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.cip8 import CIP8VerificationError, demo_signature_for, verify_cip8_signature
from app.auth.dependencies import CurrentPrincipal
from app.db import get_session
from app.domain import AuthMode, MarketStatus
from app.models import Market, MarketEvent, OpeningForecast
from app.schemas import (
    ChartPoint,
    ChartResponse,
    MarketDetail,
    MarketListResponse,
    MarketSummary,
    OpeningForecastCreate,
    OpeningForecastListResponse,
    OpeningForecastMessageResponse,
    OpeningForecastRead,
)
from app.services.commitments import (
    bounded_opening_probability,
    forecast_leaf,
    forecast_message,
    merkle_root,
)
from app.services.events import add_outbox_event, publish_committed_event

router = APIRouter(prefix="/markets", tags=["markets"])
Session = Annotated[AsyncSession, Depends(get_session)]


async def _market_or_404(session: AsyncSession, market_id: str) -> Market:
    market = await session.get(Market, market_id)
    if market is None:
        raise HTTPException(status_code=404, detail="market not found")
    return market


@router.get("", response_model=MarketListResponse)
async def list_markets(
    session: Session,
    category: str | None = None,
    market_status: Annotated[MarketStatus | None, Query(alias="status")] = None,
    search: str | None = None,
    is_simulation: bool | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> MarketListResponse:
    filters = []
    if category:
        filters.append(func.lower(Market.category) == category.lower())
    if market_status:
        filters.append(Market.status == market_status.value)
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(or_(Market.statement.ilike(pattern), Market.category.ilike(pattern)))
    if is_simulation is not None:
        filters.append(Market.is_simulation.is_(is_simulation))
    total = await session.scalar(select(func.count(Market.id)).where(*filters))
    markets = (
        await session.scalars(
            select(Market)
            .where(*filters)
            .order_by(Market.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return MarketListResponse(
        items=[MarketSummary.model_validate(market) for market in markets],
        total=int(total or 0),
        limit=limit,
        offset=offset,
    )


@router.get("/{market_id}", response_model=MarketDetail)
async def market_detail(market_id: str, session: Session) -> MarketDetail:
    market = await _market_or_404(session, market_id)
    events = (
        await session.scalars(
            select(MarketEvent).where(MarketEvent.market_id == market_id).order_by(MarketEvent.id)
        )
    ).all()
    chart = [
        {
            "time": event.recorded_at.isoformat(),
            "probability": (
                event.yes_probability / 100 if event.yes_probability is not None else None
            ),
            "volume": event.volume_delta_lovelace / 1_000_000,
        }
        for event in events
        if event.yes_probability is not None
    ]
    activity = [
        {
            "id": str(event.id),
            "type": "FORECAST" if "opening" in event.event_type else "BUY",
            "wallet": "simulation" if market.is_simulation else "indexed-chain-event",
            "probability": (
                event.yes_probability / 100 if event.yes_probability is not None else None
            ),
            "timestamp": event.recorded_at.isoformat(),
            "txHash": event.chain_tx_hash,
            "simulated": market.is_simulation,
        }
        for event in events
    ]
    opening_confirmations = (
        2
        if market.opening_poll_root
        and market.status
        in {
            MarketStatus.FUNDING.value,
            MarketStatus.TRADING.value,
            MarketStatus.CLOSED.value,
            MarketStatus.RESOLVED.value,
            MarketStatus.VOIDED.value,
        }
        else 0
    )
    return MarketDetail.model_validate(market).model_copy(
        update={
            "chart": chart,
            "activity": activity,
            "opening_confirmations": opening_confirmations,
            "featured": market.status == MarketStatus.TRADING.value,
        }
    )


@router.get("/{market_id}/chart", response_model=ChartResponse)
async def market_chart(market_id: str, session: Session) -> ChartResponse:
    await _market_or_404(session, market_id)
    events = (
        await session.scalars(
            select(MarketEvent).where(MarketEvent.market_id == market_id).order_by(MarketEvent.id)
        )
    ).all()
    return ChartResponse(
        market_id=market_id,
        points=[
            ChartPoint(
                sequence=event.id,
                recorded_at=event.recorded_at,
                event_type=event.event_type,
                yes_probability=event.yes_probability,
                volume_delta_lovelace=event.volume_delta_lovelace,
                confirmed_on_chain=event.chain_tx_hash is not None,
            )
            for event in events
        ],
    )


@router.get("/{market_id}/opening-forecast-message", response_model=OpeningForecastMessageResponse)
async def opening_forecast_signing_message(
    market_id: str,
    outcome: str,
    session: Session,
    principal: CurrentPrincipal,
) -> OpeningForecastMessageResponse:
    market = await _market_or_404(session, market_id)
    normalized = outcome.upper()
    if normalized not in {"YES", "NO"}:
        raise HTTPException(status_code=422, detail="outcome must be YES or NO")
    if market.status != MarketStatus.PRICE_DISCOVERY.value:
        raise HTTPException(status_code=409, detail="opening price discovery is closed")
    message = forecast_message(market.id, principal.payment_credential, normalized)
    return OpeningForecastMessageResponse(
        market_id=market.id,
        payment_credential=principal.payment_credential,
        outcome=normalized,
        message=message,
        payload_hex=message.encode("utf-8").hex(),
    )


@router.get("/{market_id}/opening-forecasts", response_model=OpeningForecastListResponse)
async def list_opening_forecasts(
    market_id: str,
    session: Session,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> OpeningForecastListResponse:
    market = await _market_or_404(session, market_id)
    forecasts = (
        await session.scalars(
            select(OpeningForecast)
            .where(OpeningForecast.market_id == market_id)
            .order_by(OpeningForecast.payment_credential)
            .limit(limit)
        )
    ).all()
    return OpeningForecastListResponse(
        market_id=market.id,
        count=market.opening_forecast_count,
        opening_yes_count=market.opening_yes_count,
        opening_no_count=market.opening_no_count,
        opening_poll_root=market.opening_poll_root,
        forecasts=[OpeningForecastRead.model_validate(forecast) for forecast in forecasts],
    )


@router.post(
    "/{market_id}/opening-forecasts",
    response_model=OpeningForecastRead,
    status_code=status.HTTP_201_CREATED,
)
async def submit_opening_forecast(
    market_id: str,
    payload: OpeningForecastCreate,
    session: Session,
    principal: CurrentPrincipal,
    request: Request,
) -> OpeningForecastRead:
    settings = request.app.state.settings
    market = await session.scalar(select(Market).where(Market.id == market_id).with_for_update())
    if market is None:
        raise HTTPException(status_code=404, detail="market not found")
    if market.status != MarketStatus.PRICE_DISCOVERY.value:
        raise HTTPException(status_code=409, detail="opening price discovery is closed")
    if market.opening_forecast_count >= 100:
        raise HTTPException(status_code=409, detail="the 100-forecast opening set is complete")
    existing = await session.scalar(
        select(OpeningForecast.id).where(
            OpeningForecast.market_id == market.id,
            OpeningForecast.payment_credential == principal.payment_credential,
        )
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="one payment credential may forecast only once per market"
        )

    outcome = str(payload.outcome)
    message = forecast_message(market.id, principal.payment_credential, outcome)
    verification_mode: AuthMode
    is_simulated = False
    if payload.cose_sign1 and payload.cose_key:
        if principal.auth_mode is not AuthMode.CIP8:
            raise HTTPException(status_code=401, detail="CIP-8 wallet session required")
        try:
            result = verify_cip8_signature(
                address=principal.address,
                expected_message=message,
                cose_sign1_hex=payload.cose_sign1,
                cose_key_hex=payload.cose_key,
                expected_network_id=settings.cardano_network_id,
            )
        except CIP8VerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        if not hmac.compare_digest(result.payment_credential, principal.payment_credential):
            raise HTTPException(
                status_code=401, detail="forecast signer differs from session wallet"
            )
        cose_sign1 = payload.cose_sign1
        cose_key = payload.cose_key
        verification_mode = AuthMode.CIP8
    elif (
        settings.allow_demo_auth
        and market.is_simulation
        and principal.auth_mode is AuthMode.DEMO
        and payload.demo_signature
        and hmac.compare_digest(payload.demo_signature, demo_signature_for(message))
    ):
        cose_sign1 = payload.demo_signature
        cose_key = f"demo-simulation-key:{principal.payment_credential}"
        verification_mode = AuthMode.SIMULATION
        is_simulated = True
    else:
        raise HTTPException(
            status_code=401,
            detail=(
                "ordinary markets require CIP-8 signatures; deterministic demo proofs are "
                "accepted only for clearly labeled simulation markets"
            ),
        )

    leaf = forecast_leaf(
        market_id=market.id,
        payment_credential=principal.payment_credential,
        outcome=outcome,
        cose_sign1=cose_sign1,
        cose_key=cose_key,
        verification_mode=verification_mode.value,
    )
    forecast = OpeningForecast(
        market_id=market.id,
        payment_credential=principal.payment_credential,
        outcome=outcome,
        signed_message=message,
        cose_sign1=cose_sign1,
        cose_key=cose_key,
        verification_mode=verification_mode.value,
        is_simulated=is_simulated,
        leaf_hash=leaf,
    )
    session.add(forecast)
    if outcome == "YES":
        market.opening_yes_count += 1
    else:
        market.opening_no_count += 1
    await session.flush()

    if market.opening_forecast_count == 100:
        ordered_leaves = (
            await session.scalars(
                select(OpeningForecast.leaf_hash)
                .where(OpeningForecast.market_id == market.id)
                .order_by(OpeningForecast.payment_credential)
            )
        ).all()
        market.opening_poll_root = merkle_root(ordered_leaves)
        market.yes_probability = bounded_opening_probability(market.opening_yes_count)
        market.status = MarketStatus.FUNDING.value
        session.add(
            MarketEvent(
                market_id=market.id,
                event_type="opening_poll.completed",
                yes_probability=market.yes_probability,
                payload={
                    "yes_count": market.opening_yes_count,
                    "no_count": market.opening_no_count,
                    "poll_root": market.opening_poll_root,
                    "is_simulation": market.is_simulation,
                    "confirmed_on_chain": False,
                },
            )
        )
    event = await add_outbox_event(
        session,
        topic="markets",
        event_type="opening_forecast.recorded",
        aggregate_id=market.id,
        payload={
            "market_id": market.id,
            "count": market.opening_forecast_count,
            "required": 100,
            "yes_probability": market.yes_probability,
            "status": market.status,
            "is_simulation": market.is_simulation,
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="duplicate opening forecast") from exc
    await publish_committed_event(request, event)
    return OpeningForecastRead.model_validate(forecast)
