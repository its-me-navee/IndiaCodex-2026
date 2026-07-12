from __future__ import annotations

import asyncio

from app.config import Settings
from app.db import Database
from app.simulation import apply_simulation_tick


def simulation_tick(candidate_actions: int = 250) -> dict[str, int]:
    """RQ entry point. It changes only disclosed off-chain simulation projections."""

    async def run() -> dict[str, int]:
        settings = Settings()
        database = Database(settings.database_url, echo=False)
        try:
            async with database.session_factory() as session:
                return await apply_simulation_tick(session, settings, candidate_actions)
        finally:
            await database.dispose()

    return asyncio.run(run())
