from redis import Redis
from rq import Queue, Worker

from app.config import Settings


def main() -> None:
    settings = Settings()
    if not settings.redis_url:
        raise RuntimeError("PROBX_REDIS_URL is required to run the worker")
    connection = Redis.from_url(settings.redis_url)
    worker = Worker([Queue("probx-simulation", connection=connection)], connection=connection)
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
