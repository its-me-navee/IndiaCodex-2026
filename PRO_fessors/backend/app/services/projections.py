from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import PositionStatus
from app.models import LiquidityContribution, Market, Position
from app.schemas import (
    LeaderboardEntry,
    LiquidityProjection,
    LiquidityReceiptProjection,
    PortfolioResponse,
    PositionRead,
)


async def liquidity_projection(session: AsyncSession, market: Market) -> LiquidityProjection:
    contribution_filters = [LiquidityContribution.market_id == market.id]
    if not market.is_simulation:
        contribution_filters.append(LiquidityContribution.is_confirmed.is_(True))
    contributions = (
        await session.scalars(
            select(LiquidityContribution)
            .where(*contribution_filters)
            .order_by(LiquidityContribution.created_at)
        )
    ).all()
    provider_count = len({item.owner_payment_credential for item in contributions})
    minimum = market.minimum_liquidity_lovelace
    contributed = market.liquidity_lovelace
    shortfall = max(0, minimum - contributed)
    progress = 100.0 if minimum <= 0 else min(100.0, contributed * 100.0 / minimum)
    worst_case = max(market.yes_liability_lovelace, market.no_liability_lovelace)
    available = contributed + market.user_collateral_lovelace - worst_case
    total_lp_units = sum(item.lp_units for item in contributions)
    terminal = market.status in {"RESOLVED", "VOIDED"}
    receipts = [
        LiquidityReceiptProjection(
            id=item.id,
            marketId=market.id,
            statement=market.statement,
            depositedAda=item.amount_lovelace / 1_000_000,
            lpUnits=item.lp_units,
            poolShare=(item.lp_units / total_lp_units if total_lp_units else 0.0),
            estimatedValueAda=(
                contributed * item.lp_units / total_lp_units / 1_000_000 if total_lp_units else 0.0
            ),
            feesEarnedAda=(
                market.lp_fees_lovelace * item.lp_units / total_lp_units / 1_000_000
                if total_lp_units
                else 0.0
            ),
            status="REDEEMABLE" if terminal else "LOCKED",
        )
        for item in contributions
    ]
    return LiquidityProjection(
        market_id=market.id,
        status=market.status,
        contributed_liquidity_lovelace=contributed,
        minimum_liquidity_lovelace=minimum,
        funding_shortfall_lovelace=shortfall,
        funding_progress_percent=round(progress, 2),
        provider_count=provider_count,
        user_collateral_lovelace=market.user_collateral_lovelace,
        yes_liability_lovelace=market.yes_liability_lovelace,
        no_liability_lovelace=market.no_liability_lovelace,
        worst_case_liability_lovelace=worst_case,
        projected_available_collateral_lovelace=available,
        lp_fees_lovelace=market.lp_fees_lovelace,
        solvent_projection=available >= 0,
        projection_notice=(
            "Projection from indexed records only. The market-specific Cardano UTxO is the "
            "source of truth, and LP principal is not protected."
        ),
        marketId=market.id,
        reserveAda=contributed / 1_000_000,
        minimumAda=minimum / 1_000_000,
        availableAda=available / 1_000_000,
        totalLpUnits=total_lp_units,
        providerCount=provider_count,
        feesEarnedAda=market.lp_fees_lovelace / 1_000_000,
        yesLiabilityAda=market.yes_liability_lovelace / 1_000_000,
        noLiabilityAda=market.no_liability_lovelace / 1_000_000,
        receipts=receipts,
    )


async def portfolio_projection(session: AsyncSession, payment_credential: str) -> PortfolioResponse:
    rows = (
        await session.execute(
            select(Position, Market.statement, Market.yes_probability)
            .join(Market, Market.id == Position.market_id)
            .where(Position.owner_payment_credential == payment_credential)
            .order_by(Position.created_at.desc())
        )
    ).all()
    positions = [
        PositionRead(
            id=position.id,
            market_id=position.market_id,
            market_statement=statement,
            outcome=position.outcome,
            shares=position.shares,
            amount_paid_lovelace=position.amount_paid_lovelace,
            entry_probability=position.entry_probability,
            maximum_payout_lovelace=position.maximum_payout_lovelace,
            estimated_value_lovelace=position.estimated_value_lovelace,
            realized_pnl_lovelace=position.realized_pnl_lovelace,
            status=position.status,
            is_simulated=position.is_simulated,
            marketId=position.market_id,
            statement=statement,
            amountPaidAda=position.amount_paid_lovelace / 1_000_000,
            entryProbability=position.entry_probability / 100,
            currentProbability=(yes_probability or 50) / 100,
            estimatedValueAda=position.estimated_value_lovelace / 1_000_000,
            maximumPayoutAda=position.maximum_payout_lovelace / 1_000_000,
            realizedPnlAda=(
                None
                if position.status == PositionStatus.OPEN.value
                else position.realized_pnl_lovelace / 1_000_000
            ),
            createdAt=position.created_at,
        )
        for position, statement, yes_probability in rows
    ]
    open_positions = [
        position for position, _, _ in rows if position.status == PositionStatus.OPEN.value
    ]
    contribution_rows = (
        await session.execute(
            select(LiquidityContribution, Market.statement, Market.liquidity_lovelace)
            .join(Market, Market.id == LiquidityContribution.market_id)
            .where(LiquidityContribution.owner_payment_credential == payment_credential)
        )
    ).all()
    lp_receipts = [
        LiquidityReceiptProjection(
            id=contribution.id,
            marketId=contribution.market_id,
            statement=statement,
            depositedAda=contribution.amount_lovelace / 1_000_000,
            lpUnits=contribution.lp_units,
            poolShare=1.0,
            estimatedValueAda=liquidity / 1_000_000,
            feesEarnedAda=0.0,
            status="LOCKED",
        )
        for contribution, statement, liquidity in contribution_rows
    ]
    realized = sum(item.realized_pnl_lovelace for item, _, _ in rows)
    committed = sum(item.amount_paid_lovelace for item in open_positions)
    estimated = sum(item.estimated_value_lovelace for item in open_positions)
    return PortfolioResponse(
        payment_credential=payment_credential,
        open_exposure_lovelace=committed,
        estimated_value_lovelace=estimated,
        realized_pnl_lovelace=realized,
        positions=positions,
        wallet=payment_credential,
        availableAda=0.0,
        committedAda=committed / 1_000_000,
        estimatedValueAda=estimated / 1_000_000,
        realizedPnlAda=realized / 1_000_000,
        unrealizedPnlAda=(estimated - committed) / 1_000_000,
        lpReceipts=lp_receipts,
    )


async def leaderboard_projection(session: AsyncSession, limit: int) -> list[LeaderboardEntry]:
    terminal = {
        PositionStatus.CASHED_OUT.value,
        PositionStatus.WON.value,
        PositionStatus.LOST.value,
        PositionStatus.VOID_REFUNDED.value,
    }
    positions = (
        await session.scalars(
            select(Position).where(Position.is_simulated.is_(False), Position.status.in_(terminal))
        )
    ).all()
    grouped: dict[str, list[Position]] = defaultdict(list)
    for position in positions:
        grouped[position.owner_payment_credential].append(position)
    ranked = sorted(
        grouped.items(),
        key=lambda item: sum(position.realized_pnl_lovelace for position in item[1]),
        reverse=True,
    )[:limit]
    entries: list[LeaderboardEntry] = []
    for rank, (credential, wallet_positions) in enumerate(ranked, start=1):
        resolved = [
            position
            for position in wallet_positions
            if position.status in {PositionStatus.WON.value, PositionStatus.LOST.value}
        ]
        won = sum(position.status == PositionStatus.WON.value for position in resolved)
        accuracy = won * 100.0 / len(resolved) if resolved else 0.0
        entries.append(
            LeaderboardEntry(
                rank=rank,
                payment_credential=credential,
                display_credential=f"{credential[:8]}…{credential[-6:]}",
                realized_pnl_lovelace=sum(
                    position.realized_pnl_lovelace for position in wallet_positions
                ),
                prediction_accuracy=round(accuracy, 2),
                resolved_position_count=len(resolved),
                wallet=credential,
                realizedPnlAda=(
                    sum(position.realized_pnl_lovelace for position in wallet_positions) / 1_000_000
                ),
                accuracy=round(accuracy / 100, 4),
                resolvedPositions=len(resolved),
            )
        )
    return entries
