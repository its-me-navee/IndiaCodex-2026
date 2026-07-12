.PHONY: up down logs test check check-deployment test-backend test-frontend test-contracts

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs --follow --tail=100

test: test-backend test-frontend test-contracts

test-backend:
	cd backend && uv run pytest

test-frontend:
	npm --prefix frontend test -- --run

test-contracts:
	cd contracts && aiken check -D

check:
	cd backend && uv run ruff check .
	cd backend && uv run ruff format --check .
	cd backend && uv run mypy app
	npm --prefix frontend run typecheck
	npm --prefix frontend run build
	cd contracts && aiken fmt --check
	cd contracts && aiken check -D
	cd contracts && aiken build
	node scripts/check-contract-sizes.mjs

check-deployment:
	cd contracts && aiken build
	node scripts/check-contract-sizes.mjs
