from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.auth.cip8 import demo_signature_for
from app.config import Settings
from app.db import Database
from app.domain import (
    AuthMode,
    DraftStatus,
    MarketStatus,
    PositionStatus,
)
from app.models import (
    LiquidityContribution,
    Market,
    MarketDraft,
    MarketEvent,
    OpeningForecast,
    Position,
    SimulationState,
)
from app.services.commitments import (
    bounded_opening_probability,
    forecast_leaf,
    forecast_message,
    merkle_root,
    terms_hash,
)
from app.simulation import STRATEGY_WEIGHTS

SIMULATION_MARKET_ID = "10000000-0000-4000-8000-000000000001"
REAL_DRAFT_ID = "20000000-0000-4000-8000-000000000001"
REAL_MARKET_ID = "30000000-0000-4000-8000-000000000001"


async def seed_demo_data(database: Database, settings: Settings) -> None:
    now = datetime.now(UTC)
    async with database.session_factory() as session:
        simulation_market = await session.get(Market, SIMULATION_MARKET_ID)
        if simulation_market is None:
            simulation_terms = {
                "statement": "Will ADA close above $1.25 before 31 December 2026?",
                "category": "Crypto",
                "yes_criteria": (
                    "YES if the CoinGecko ADA/USD daily close is strictly greater than 1.25 USD "
                    "on any UTC day through 2026-12-31."
                ),
                "primary_source": "https://www.coingecko.com/en/coins/cardano/historical_data",
                "invalid_market_rule": (
                    "VOID if the primary and backup sources are both unavailable."
                ),
            }
            simulation_market = Market(
                id=SIMULATION_MARKET_ID,
                slug="ada-above-125-by-december-2026-simulation",
                creator_payment_credential="sim-creator",
                statement=simulation_terms["statement"],
                category=simulation_terms["category"],
                trading_deadline=now + timedelta(days=120),
                resolution_deadline=now + timedelta(days=127),
                yes_criteria=simulation_terms["yes_criteria"],
                primary_source=simulation_terms["primary_source"],
                backup_source="https://coinmarketcap.com/currencies/cardano/historical-data/",
                invalid_market_rule=simulation_terms["invalid_market_rule"],
                terms_hash=terms_hash(simulation_terms),
                status=MarketStatus.TRADING.value,
                is_simulation=True,
                minimum_liquidity_lovelace=100_000_000,
                liquidity_lovelace=180_000_000,
                user_collateral_lovelace=64_000_000,
                volume_lovelace=245_000_000,
                lp_fees_lovelace=2_450_000,
                yes_liability_lovelace=122_000_000,
                no_liability_lovelace=84_000_000,
            )
            session.add(simulation_market)
            await session.flush()

        existing_credentials = set(
            (
                await session.scalars(
                    select(OpeningForecast.payment_credential).where(
                        OpeningForecast.market_id == SIMULATION_MARKET_ID
                    )
                )
            ).all()
        )
        for index in range(100):
            credential = f"sim-persona-{index:05d}"
            if credential in existing_credentials:
                continue
            outcome = "YES" if index < 64 else "NO"
            message = forecast_message(SIMULATION_MARKET_ID, credential, outcome)
            signature = demo_signature_for(message)
            cose_key = f"demo-simulation-key:{credential}"
            session.add(
                OpeningForecast(
                    market_id=SIMULATION_MARKET_ID,
                    payment_credential=credential,
                    outcome=outcome,
                    signed_message=message,
                    cose_sign1=signature,
                    cose_key=cose_key,
                    verification_mode=AuthMode.SIMULATION.value,
                    is_simulated=True,
                    leaf_hash=forecast_leaf(
                        market_id=SIMULATION_MARKET_ID,
                        payment_credential=credential,
                        outcome=outcome,
                        cose_sign1=signature,
                        cose_key=cose_key,
                        verification_mode=AuthMode.SIMULATION.value,
                    ),
                )
            )
        await session.flush()
        forecasts = (
            await session.scalars(
                select(OpeningForecast)
                .where(OpeningForecast.market_id == SIMULATION_MARKET_ID)
                .order_by(OpeningForecast.payment_credential)
            )
        ).all()
        if len(forecasts) == 100:
            yes_count = sum(item.outcome == "YES" for item in forecasts)
            simulation_market.opening_yes_count = yes_count
            simulation_market.opening_no_count = 100 - yes_count
            simulation_market.opening_poll_root = merkle_root(item.leaf_hash for item in forecasts)
            simulation_market.yes_probability = bounded_opening_probability(yes_count)

        for suffix, owner, amount in (
            ("a", "sim-lp-alice", 100_000_000),
            ("b", "sim-lp-bob", 50_000_000),
            ("c", "sim-lp-charlie", 30_000_000),
        ):
            contribution_id = f"40000000-0000-4000-8000-00000000000{1 + ord(suffix) - ord('a')}"
            if await session.get(LiquidityContribution, contribution_id) is None:
                session.add(
                    LiquidityContribution(
                        id=contribution_id,
                        market_id=SIMULATION_MARKET_ID,
                        owner_payment_credential=owner,
                        amount_lovelace=amount,
                        lp_units=amount,
                        receipt_reference=f"simulation-only:lp-receipt-{suffix}",
                        is_confirmed=False,
                        is_simulated=True,
                    )
                )

        demo_positions = (
            (
                "50000000-0000-4000-8000-000000000001",
                PositionStatus.OPEN.value,
                "YES",
                10_000_000,
                12_400_000,
                0,
            ),
            (
                "50000000-0000-4000-8000-000000000002",
                PositionStatus.CASHED_OUT.value,
                "NO",
                8_000_000,
                6_700_000,
                -1_300_000,
            ),
        )
        for position_id, position_status, outcome, paid, value, pnl in demo_positions:
            if await session.get(Position, position_id) is None:
                session.add(
                    Position(
                        id=position_id,
                        market_id=SIMULATION_MARKET_ID,
                        owner_payment_credential="demo-alice",
                        outcome=outcome,
                        shares=18_000_000,
                        amount_paid_lovelace=paid,
                        entry_probability=55,
                        maximum_payout_lovelace=18_000_000,
                        estimated_value_lovelace=value,
                        realized_pnl_lovelace=pnl,
                        status=position_status,
                        is_simulated=True,
                        position_reference="simulation-only:not-a-cardano-utxo",
                    )
                )

        has_event = await session.scalar(
            select(MarketEvent.id).where(
                MarketEvent.market_id == SIMULATION_MARKET_ID,
                MarketEvent.event_type == "simulation.seeded",
            )
        )
        if not has_event:
            session.add(
                MarketEvent(
                    market_id=SIMULATION_MARKET_ID,
                    event_type="simulation.seeded",
                    yes_probability=64,
                    payload={
                        "clearly_labeled": True,
                        "off_chain": True,
                        "confirmed_on_chain": False,
                    },
                )
            )

        real_draft = await session.get(MarketDraft, REAL_DRAFT_ID)
        if real_draft is None:
            real_draft = MarketDraft(
                id=REAL_DRAFT_ID,
                creator_payment_credential="demo-creator",
                statement="Will a Cardano node 10.x release ship before 1 October 2026?",
                category="Technology",
                trading_deadline=now + timedelta(days=60),
                resolution_deadline=now + timedelta(days=67),
                yes_criteria=(
                    "YES if an official Input Output GitHub release tagged 10.x is published "
                    "before 2026-10-01T00:00:00Z."
                ),
                primary_source="https://github.com/IntersectMBO/cardano-node/releases",
                backup_source="https://cardano.org/news/",
                invalid_market_rule="VOID if the official release record is removed or ambiguous.",
                status=DraftStatus.APPROVED.value,
                normalized_statement=(
                    "Will a Cardano node 10.x release ship before 1 October 2026?"
                ),
                normalized_yes_criteria=(
                    "YES if an official Input Output GitHub release tagged 10.x is published "
                    "before 2026-10-01T00:00:00Z."
                ),
                normalized_primary_source=("https://github.com/IntersectMBO/cardano-node/releases"),
                review_note="Seeded approved terms; activation still requires the creator wallet.",
                reviewed_by="demo-admin",
                reviewed_at=now,
            )
            session.add(real_draft)
            await session.flush()

        if await session.get(Market, REAL_MARKET_ID) is None:
            real_terms = {
                "statement": real_draft.normalized_statement,
                "yes_criteria": real_draft.normalized_yes_criteria,
                "primary_source": real_draft.normalized_primary_source,
            }
            session.add(
                Market(
                    id=REAL_MARKET_ID,
                    draft_id=REAL_DRAFT_ID,
                    slug="cardano-node-10x-before-october-2026",
                    creator_payment_credential="demo-creator",
                    statement=real_draft.normalized_statement,
                    category=real_draft.category,
                    trading_deadline=real_draft.trading_deadline,
                    resolution_deadline=real_draft.resolution_deadline,
                    yes_criteria=real_draft.normalized_yes_criteria,
                    primary_source=real_draft.normalized_primary_source,
                    backup_source=real_draft.backup_source,
                    invalid_market_rule=real_draft.invalid_market_rule,
                    terms_hash=terms_hash(real_terms),
                    status=MarketStatus.PRICE_DISCOVERY.value,
                    is_simulation=False,
                    minimum_liquidity_lovelace=(settings.default_minimum_liquidity_lovelace),
                )
            )

        state = await session.get(SimulationState, 1)
        if state is None:
            session.add(
                SimulationState(
                    id=1,
                    active=True,
                    virtual_personas=settings.simulation_personas,
                    random_seed=settings.simulation_seed,
                    generated_actions=25_000,
                    accepted_actions=23_400,
                    rejected_actions=1_600,
                    real_preprod_transactions=0,
                    last_tick_at=now,
                    strategies=STRATEGY_WEIGHTS,
                )
            )
        await session.commit()


async def _async_main() -> None:
    settings = Settings()
    database = Database(settings.database_url, echo=False)
    try:
        await seed_demo_data(database, settings)
    finally:
        await database.dispose()


def main() -> None:
    asyncio.run(_async_main())


if __name__ == "__main__":
    main()
