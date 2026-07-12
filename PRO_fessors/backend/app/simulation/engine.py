from __future__ import annotations

import random
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import OutboxEvent, SimulationState

STRATEGY_WEIGHTS = {
    "passive": 3_000,
    "momentum": 2_000,
    "contrarian": 1_500,
    "whale": 500,
    "random": 2_000,
    "scalper": 1_000,
}


async def apply_simulation_tick(
    session: AsyncSession, settings: Settings, candidate_actions: int
) -> dict[str, int]:
    state = await session.get(SimulationState, 1)
    if state is None:
        state = SimulationState(
            id=1,
            active=True,
            virtual_personas=settings.simulation_personas,
            random_seed=settings.simulation_seed,
            strategies=STRATEGY_WEIGHTS,
        )
        session.add(state)
        await session.flush()
    rng = random.Random(state.random_seed + state.generated_actions)
    accepted = sum(rng.random() >= 0.08 for _ in range(candidate_actions))
    rejected = candidate_actions - accepted
    state.generated_actions += candidate_actions
    state.accepted_actions += accepted
    state.rejected_actions += rejected
    state.last_tick_at = datetime.now(UTC)
    session.add(
        OutboxEvent(
            topic="simulation",
            event_type="simulation.tick",
            aggregate_id="1",
            payload={
                "candidate_actions": candidate_actions,
                "accepted_actions": accepted,
                "rejected_actions": rejected,
                "real_preprod_transactions": 0,
                "off_chain": True,
                "clearly_labeled": True,
            },
        )
    )
    await session.commit()
    return {"generated": candidate_actions, "accepted": accepted, "rejected": rejected}
