from __future__ import annotations

from redis import Redis
from rq import Queue


def enqueue_simulation_tick(redis_url: str, candidate_actions: int) -> str:
    connection = Redis.from_url(redis_url)
    queue = Queue("probx-simulation", connection=connection)
    job = queue.enqueue(
        "app.workers.jobs.simulation_tick",
        candidate_actions,
        job_timeout=120,
        result_ttl=300,
    )
    return job.id
