#!/bin/sh
set -eu

uv run --no-dev alembic upgrade head

if [ "${PROBX_SEED_DEMO_DATA:-false}" = "true" ]; then
  uv run --no-dev python -m app.seed
fi

exec uv run --no-dev "$@"

