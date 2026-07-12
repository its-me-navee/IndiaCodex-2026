# ProbX frontend

React 19 + Vite frontend for the ProbX Cardano preprod hackathon MVP. It presents statement-market discovery, trading, full position cash-out, market-isolated liquidity, portfolios, realized-P/L reputation, a disclosed load simulation, and a transparent single-admin resolution workflow.

## Stack

- React 19, TypeScript, Vite, React Router
- Tailwind CSS 4
- TanStack Query for API snapshots and polling
- Zustand for wallet/UI/toast state
- React Hook Form + Zod for structured proposals
- Cardano Foundation **Cardano Connect with Wallet** for CIP-30 discovery, mobile/deep-link support, and connection UI
- Mesh SDK behind a lazy transaction-plan adapter
- Vitest + Testing Library

## Start

Node.js 22 is recommended.

```bash
cd probx/frontend
npm install
npm run dev
```

Open `http://localhost:5173`. If the API, wallet extension, or script deployment is unavailable, the application intentionally enters polished demo mode. Submissions return clearly labeled demo receipts; no fake operation is described as confirmed preprod state.

Put local overrides in the untracked `frontend/.env` file. Supported variables are listed below.

## Environment

```dotenv
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_NETWORK=preprod
VITE_BLOCKFROST_PROJECT_ID=preprod_REPLACE_ME
VITE_EXPLORER_URL=https://preprod.cardanoscan.io
VITE_MARKET_LIFECYCLE_SCRIPT_ADDRESS=
VITE_MARKET_SCRIPT_ADDRESS=
VITE_MARKET_SETTLEMENT_SCRIPT_ADDRESS=
VITE_LIQUIDITY_SCRIPT_ADDRESS=
VITE_POSITION_SCRIPT_ADDRESS=
VITE_ADMIN_PAYMENT_CREDENTIAL=
VITE_DEPLOYMENT_MIN_COLLATERAL_LOVELACE=5000000
VITE_DEMO_FALLBACK=true
```

`VITE_ADMIN_PAYMENT_CREDENTIAL` is the deployment admin wallet's 56-character lowercase
payment-key hash. It is an identifier, not a private key, seed phrase, signing key, or address.
The frontend never accepts or reads wallet keys.

The bootstrap builder requires all five script-address variables. `VITE_MARKET_SCRIPT_ADDRESS`
means the trading-phase address; lifecycle and settlement use their explicit variables. Every
configured address must exactly match the graph derived from the currently selected seed. The
Blockfrost project ID is bundled into browser code, so use a restricted preprod-only key for this
hackathon surface rather than a privileged production credential.

`VITE_API_URL` is an origin, not an `/api/v1` prefix. The client calls the backend contract directly:

- `GET /health`
- `GET /markets`, `GET /markets/{id}`
- `GET /markets/{id}/liquidity`
- `GET /portfolio`, `GET /leaderboard`, `GET /simulation/status`
- `GET /deployment/status`
- `GET/POST /market-drafts`
- the payload endpoints documented in the repository root README

The market normalizer accepts the backend baseline fields:

```text
id, statement, category, status, opening_forecast_count,
yes_probability, liquidity_lovelace, volume_lovelace,
trading_deadline, resolution_deadline
```

Backend `yes_probability` is an integer percentage (`1..99`) and is divided by 100. `VOIDED` is normalized to the frontend `VOID` terminal presentation. During `PRICE_DISCOVERY`, probability is always hidden even if a provisional value is present.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Product overview and featured signals |
| `/markets` | Search/filter market directory |
| `/markets/:id` | Terms, opening proof, probability, trade, full cash-out, activity |
| `/create` | Structured off-chain market proposal |
| `/liquidity` | Per-market liquidity directory |
| `/markets/:id/liquidity` | Deposit, LP quote, solvency, market-specific receipts |
| `/portfolio` | Open/current positions, complete exits, history, LP receipts |
| `/leaderboard` | Confirmed realized-P/L ranking; simulation excluded |
| `/simulation` | Explicitly labeled 10,000-persona off-chain load lab |
| `/admin` | Read-only deployment preflight, draft normalization, and trusted 1-of-1 admin YES/NO/VOID resolution UI |

## Economic UX invariants

- A new market never displays an automatic 50/50 probability. Exactly 100 unique forecasts determine the bounded 1%–99% opening tick.
- Every buy and complete cash-out displays the exact 1% LP fee.
- Cash-out is full-position only; the UI never offers partial quantity.
- Liquidity is selected and displayed per market. Receipts do not imply principal protection or cross-market diversification.
- Resolution surfaces `YES`, `NO`, and `VOID`. For the hackathon MVP, one disclosed admin wallet provides the single required outcome signature.
- Resolution is explicitly labeled **trusted and centralized**. The admin signs the outcome and evidence only; it cannot withdraw market liquidity, spend user positions, cash out for users, or redirect contract payouts.
- A production upgrade should replace the 1-of-1 shortcut with category-specific data oracles, an evidence challenge/dispute window, and multi-party quorum governance.
- Simulation is visually and semantically distinct from real wallet participation.

## Wallet and transaction boundary

`src/components/wallet-button.tsx` uses Cardano Connect with Wallet on `NetworkType.TESTNET`. `src/lib/wallet.ts` exposes the CIP-30 sign/submit boundary and a lazy Mesh `MeshTxBuilder` adapter for deterministic transaction plans. In the MVP, FastAPI payload routes normally return unsigned transaction CBOR; the connected wallet signs and submits it. Secrets and signing keys never enter frontend state.

Mesh's browser serializer imports Node-compatible crypto, stream, and VM primitives. `vite.config.ts` supplies audited browserify-style shims through `vite-plugin-node-polyfills`; it does not emulate a Node server or persist key material. Mesh is isolated behind the transaction adapter and split from the application route bundle. Backend-provided unsigned CBOR remains the default integration path.

### Admin deployment preflight

The admin page includes a read-only CIP-30 readiness check. After the user approves the normal
wallet connection, it reads only:

- network id;
- change address;
- spendable UTxOs; and
- collateral UTxOs.

Mesh loads lazily to decode those public wallet values and derive the change-address payment
credential. The result is compared with `VITE_ADMIN_PAYMENT_CREDENTIAL` and shown as `READY`,
`NEEDS_COLLATERAL`, `NEEDS_SPENDABLE`, `WRONG_WALLET`, `WRONG_NETWORK`, or `CONFIG_REQUIRED`.
The UI reports counts and lovelace totals but does not request a signature, submit a transaction,
or access any key material.

The same surface queries `GET /deployment/status` and lists five spending-script addresses in
contract-graph order: market lifecycle, market trading, market settlement, liquidity, and
position. Each is reported as `NOT_CONFIGURED`, `OBSERVED`, `NOT_OBSERVED`, or `UNKNOWN`. These are
address configuration and transaction-history observations only. The backend caveat is displayed
verbatim: observation never proves validator identity, parameters, correctness, or a successful
deployment. If the API is unavailable, demo fallback shows all five observations as `UNKNOWN`;
it never invents configured addresses or `OBSERVED` chain activity.

`READY` is not a deployment action. The separate bootstrap wizard repeats all material checks and
does not trust the readiness badge as authority.

CIP-30 network id `0` identifies the Cardano testnet class and cannot by itself distinguish
preprod from preview. The preflight rejects mainnet and other network ids; final deployment must
also verify the selected provider/genesis is preprod before constructing any transaction.

### Bootstrap deployment wizard

The admin bootstrap is deliberately split into two user actions:

1. **Prepare & review unsigned tx** loads `public/contracts/plutus.json`, reads current Lace UTxOs,
   and selects the largest pure-ADA UTxO controlled by the configured admin credential after
   excluding every CIP-30 collateral reference. It chooses a separate designated pure-ADA
   collateral UTxO, revalidates both references as currently unspent through preprod Blockfrost,
   and derives the full graph with `applyParamsToScript(..., "JSON")` in the contracts README order.
2. **Sign & submit in Lace** is enabled only after the unsigned CBOR has passed the five configured
   address comparisons, fixed-genesis datum checks, Blockfrost evaluation, protocol maximum-size
   check plus signing-witness margin, exact two-token mint plan, and review display. This click asks
   Lace for the single admin signature, merges its witness into the full transaction, and submits.

The atomic transaction mints exactly one `MARKET_STATE` and one `LIQUIDITY_STATE`. It creates a
3 ADA `PendingActivation` market output with an inline datum at the lifecycle address and a 3 ADA
empty-reserve inline datum at the liquidity address. The bootstrap policy uses the derived
`Bootstrap(lifecycle_hash, liquidity_hash)` redeemer, explicit seed input, separate collateral,
and configured admin required signer. No additional wallet UTxO is silently selected.

Preparation never signs, and no private key, seed phrase, or local signing key enters the app.
After submission the only positive label is `SUBMITTED_UNCONFIRMED`; the transaction hash links to
the explorer, but the UI does not claim chain inclusion, confirmation, or validator correctness.
If the seed changes, the policy and every downstream address change, so stale configuration stops
with `CONFIG_MISMATCH` before CBOR construction.

Refresh the browser asset after rebuilding the Aiken blueprint:

```bash
npm run contracts:sync
```

The sync command copies `../contracts/plutus.json` to `public/contracts/plutus.json` and prints its
SHA-256 digest. It does not modify the contracts package.

## Docker

Development target (Vite on port 5173):

```bash
docker build --target development -t probx-frontend-dev .
docker run --rm -p 5173:5173 --env-file .env probx-frontend-dev
```

Production target builds static assets and serves the SPA from nginx on port 80:

```bash
docker build --target production \
  --build-arg VITE_API_URL=http://localhost:8000 \
  --build-arg VITE_WS_URL=ws://localhost:8000 \
  -t probx-frontend .
docker run --rm -p 8080:80 probx-frontend
```

The included nginx config uses SPA fallback and exposes `/healthz` for Compose health checks.

## Verify

```bash
npm run typecheck
npm test
npm run build
```

Tests cover 100-forecast discovery, unanimous 1%–99% bounds, integer-percent API normalization,
`VOIDED` mapping, exact 1% trade and cash-out fees, complete cash-out math, LP unit issuance, and
all deployment-preflight readiness and backend observation states without invoking wallet signing
or submission or fabricating demo chain activity. Bootstrap tests cover parameter order, dynamic
seed/collateral selection, `CONFIG_MISMATCH`, genesis datum shape, exact mint/output assembly,
preparation-without-signing, and the explicit Lace submission phase.

This is testnet-only, unaudited hackathon software. Do not use it with real-value assets or deploy it to Cardano mainnet.
