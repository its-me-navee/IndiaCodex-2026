# ProbX backend

FastAPI and PostgreSQL projections for the testnet-only ProbX hackathon MVP. Cardano
preprod remains authoritative for custody and settlement. Every transaction endpoint in
this service returns **unsigned building parameters** with `chain_status=NOT_SUBMITTED` and
`confirmation_status=NOT_OBSERVED`; it never spends a wallet or claims chain confirmation.

## Local development

```bash
uv sync --python 3.12
uv run alembic upgrade head
uv run probx-seed
uv run uvicorn app.main:app --reload
```

The backend has safe local defaults. Put any machine-specific overrides in an untracked
`backend/.env` file.

OpenAPI is at <http://localhost:8000/docs> and health is at
<http://localhost:8000/health>. Start PostgreSQL, Redis, the API, and an RQ worker with:

```bash
docker compose up --build
```

The seed is idempotent. It creates one ordinary market in `PRICE_DISCOVERY`, one clearly
labeled simulation market, exactly 100 disclosed simulated opening forecast records, sample
liquidity projections, sample simulated portfolio positions, and a deterministic 10,000-persona
simulation status. It creates no wallet funds and submits no Cardano transactions.

## Authentication

`POST /auth/challenge` produces the exact UTF-8 payload for wallet `signData`. `POST
/auth/verify` validates CIP-8 COSE_Sign1/COSE_Key CBOR, Ed25519, the protected address, payment
key hash, network id, expiry, and one-time challenge consumption.

Setting `PROBX_ALLOW_DEMO_AUTH=true` enables an intentionally insecure fallback for local UI
work. Challenge responses then include a `demo_signature`, and authenticated routes also accept
`X-Demo-Wallet`. Admin routes additionally require `X-Admin-Key`. Demo authentication and
synthetic forecast proofs are explicitly labeled and must stay disabled outside local demos.

The MVP configures exactly one public admin payment credential with
`PROBX_ADMIN_PAYMENT_CREDENTIAL`. Resolution endpoints authenticate that wallet and return an
unsigned transaction that still requires its CIP-30 signature. The backend never receives a
private key, signs for the admin, or takes custody of market funds.

## Deployment status

`GET /deployment/status` reports the preprod network, the configured public admin payment
credential, and configuration/chain-observation status for the five validators in contract-flow
order: market lifecycle, market trading, market settlement, liquidity, and position. Configure
them with `PROBX_MARKET_LIFECYCLE_SCRIPT_ADDRESS`, `PROBX_MARKET_SCRIPT_ADDRESS`,
`PROBX_MARKET_SETTLEMENT_SCRIPT_ADDRESS`, `PROBX_LIQUIDITY_SCRIPT_ADDRESS`, and
`PROBX_POSITION_SCRIPT_ADDRESS`. The existing `PROBX_MARKET_SCRIPT_ADDRESS` specifically refers
to the trading-phase validator.

When a Blockfrost project ID is configured, the API checks each configured address for transaction
history. `OBSERVED` means Blockfrost found chain activity at that address; it does not prove which
validator version produced the address. `NOT_OBSERVED` means no history was returned, while
`UNKNOWN` indicates Blockfrost was not configured or the query failed. The project ID is never
included in the response, and an address being present in configuration is never reported as a
deployment confirmation.

## Checks

```bash
uv run pytest
uv run ruff check .
uv run mypy app
```
