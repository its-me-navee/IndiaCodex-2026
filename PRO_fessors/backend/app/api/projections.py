from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import AdminPrincipal, CurrentPrincipal
from app.db import get_session
from app.models import Market, SimulationState
from app.schemas import (
    LeaderboardResponse,
    LiquidityProjection,
    PortfolioResponse,
    SimulationStatusResponse,
    SimulationStrategyProjection,
    SimulationTickRequest,
    SimulationTickResponse,
)
from app.services.projections import (
    leaderboard_projection,
    liquidity_projection,
    portfolio_projection,
)
from app.workers.queue import enqueue_simulation_tick

router = APIRouter(tags=["projections"])
Session = Annotated[AsyncSession, Depends(get_session)]
SIMULATION_COLORS = {
    "passive": "#94a3b8",
    "momentum": "#22c55e",
    "contrarian": "#a855f7",
    "whale": "#f59e0b",
    "random": "#38bdf8",
    "scalper": "#f43f5e",
}


def _strategy_rows(values: dict[str, int]) -> list[SimulationStrategyProjection]:
    return [
        SimulationStrategyProjection(
            name=name,
            personas=count,
            color=SIMULATION_COLORS.get(name, "#64748b"),
        )
        for name, count in values.items()
    ]


@router.get("/markets/{market_id}/liquidity", response_model=LiquidityProjection)
async def get_liquidity_projection(market_id: str, session: Session) -> LiquidityProjection:
    market = await session.get(Market, market_id)
    if market is None:
        raise HTTPException(status_code=404, detail="market not found")
    return await liquidity_projection(session, market)


@router.get("/portfolio", response_model=PortfolioResponse)
async def get_portfolio(session: Session, principal: CurrentPrincipal) -> PortfolioResponse:
    return await portfolio_projection(session, principal.payment_credential)


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    session: Session, limit: Annotated[int, Query(ge=1, le=100)] = 25
) -> LeaderboardResponse:
    entries = await leaderboard_projection(session, limit)
    return LeaderboardResponse(entries=entries, items=entries)


@router.get("/simulation/status", response_model=SimulationStatusResponse)
async def get_simulation_status(session: Session, request: Request) -> SimulationStatusResponse:
    settings = request.app.state.settings
    state = await session.get(SimulationState, 1)
    if state is None:
        return SimulationStatusResponse(
            active=False,
            virtual_personas=settings.simulation_personas,
            random_seed=settings.simulation_seed,
            generated_actions=0,
            accepted_actions=0,
            rejected_actions=0,
            real_preprod_transactions=0,
            real_transaction_limit=settings.simulation_real_tx_limit,
            last_tick_at=None,
            strategy_counts={},
            strategies=[],
            running=False,
            seed=settings.simulation_seed,
            personas=settings.simulation_personas,
            actionsPerMinute=0,
            queuedActions=0,
            backedTransactions=0,
            databaseEvents=0,
            websocketClients=0,
            disclosure=(
                "No simulation run has been initialized. Personas and actions are virtual and "
                "must never be represented as real users or Cardano transactions."
            ),
        )
    return SimulationStatusResponse(
        active=state.active,
        virtual_personas=state.virtual_personas,
        random_seed=state.random_seed,
        generated_actions=state.generated_actions,
        accepted_actions=state.accepted_actions,
        rejected_actions=state.rejected_actions,
        real_preprod_transactions=state.real_preprod_transactions,
        real_transaction_limit=settings.simulation_real_tx_limit,
        last_tick_at=state.last_tick_at,
        strategy_counts=state.strategies,
        strategies=_strategy_rows(state.strategies),
        running=state.active,
        seed=state.random_seed,
        personas=state.virtual_personas,
        actionsPerMinute=250 if state.active else 0,
        queuedActions=0,
        backedTransactions=state.real_preprod_transactions,
        databaseEvents=state.generated_actions,
        websocketClients=0,
        disclosure=(
            "10,000 deterministic off-chain personas exercise API, database, queue, and live "
            "projection paths. They are not 10,000 people or concurrent Cardano transactions."
        ),
    )


@router.post("/simulation/tick", response_model=SimulationTickResponse, status_code=202)
async def queue_simulation_tick(
    payload: SimulationTickRequest,
    principal: AdminPrincipal,
    request: Request,
) -> SimulationTickResponse:
    del principal
    redis_url = request.app.state.settings.redis_url
    if not redis_url:
        raise HTTPException(status_code=503, detail="Redis queue is disabled")
    try:
        job_id = enqueue_simulation_tick(redis_url, payload.candidate_actions)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Redis queue is unavailable") from exc
    return SimulationTickResponse(queued=True, job_id=job_id)
