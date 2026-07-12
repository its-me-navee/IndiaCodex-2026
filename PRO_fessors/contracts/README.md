# ProbX contracts

Compileable Aiken/Plutus V3 vertical slice for the testnet-only ProbX MVP. The
contracts implement isolated market liquidity, NFT-authenticated LP receipts
and positions, opening-price discovery, bounded integer curve trades, complete
cash-out, single-admin MVP resolution, timeout VOID, claims, and terminal LP
sharing.

## Commands

```sh
aiken fmt --check
aiken check -D
aiken build
```

The package targets Aiken `v1.1.23`, stdlib `v3`, and Plutus V3. The generated
CIP-57 blueprint is `plutus.json`.

## Modules

- `lib/probx/types.ak` — datum, redeemer, outcome, and status schemas.
- `lib/probx/curve.ak` — bounded 1–99 integer curve and fee calculations.
- `lib/probx/helpers.ak` — authentication, admin resolution, payment, solvency,
  and LP arithmetic.
- `lib/probx/bootstrap.ak` — atomic one-shot state-NFT bootstrap validation and
  transaction-context tests.
- `lib/probx/market_checks.ak` — checks shared by the three market phases.
- `lib/probx/invariants.ak` — deterministic exhaustive curve/invariant tests.
- `validators/state_token.ak` — seed-UTxO one-shot policy for the two state
  NFTs.
- `validators/market_lifecycle.ak` — activation and 100-forecast opening.
- `validators/market.ak` — trading, cash-out, resolution, and timeout VOID.
- `validators/market_settlement.ak` — winning/VOID claims and finalization.
- `validators/liquidity.ak` — per-market reserve and LP-unit accounting.
- `validators/position.ak` — owner-authorized position consumption.
- `validators/lp_receipt.ak` — owner-authorized LP-receipt consumption.
- `validators/position_token.ak` — position NFT issue/burn policy.
- `validators/lp_receipt_token.ak` — LP-receipt NFT issue/burn policy.

## Applied validators and deployment order

Each market has one shared one-shot policy and two fixed-name state NFTs:

```text
MARKET_STATE    = 4d41524b45545f5354415445
LIQUIDITY_STATE = 4c49515549444954595f5354415445
```

The policy consumes a designated admin-controlled seed UTxO, requires the
admin payment-key signature, mints exactly one of each name, and locks them in
separate inline-datum outputs. It accepts both base and enterprise seed
addresses by comparing the payment credential, not the whole address. The
seed reference makes the policy permanently non-mintable after bootstrap.

Apply parameters in this exact order. Parameter order shown here is also the
order in `plutus.json`:

1. Select an unspent UTxO whose payment credential is `admin_pkh`. Do not spend
   it before bootstrap. Apply
   `state_token.state_token.mint(seed_ref, admin_pkh)` to obtain
   `state_policy_id`.
2. Define `trusted_market_thread = (state_policy_id, MARKET_STATE)` and
   `trusted_liquidity_thread = (state_policy_id, LIQUIDITY_STATE)`.
3. Apply `position.position.spend(trusted_market_thread)` to obtain
   `position_script_hash`, and
   `lp_receipt.lp_receipt.spend(trusted_liquidity_thread)` to obtain
   `lp_receipt_script_hash`.
4. Apply `position_token.position_token.mint(trusted_market_thread,
   position_script_hash)` to obtain `position_policy_id`, and
   `lp_receipt_token.lp_receipt_token.mint(trusted_liquidity_thread,
   lp_receipt_script_hash)` to obtain `lp_receipt_policy_id`.
5. Apply `market_settlement.market_settlement.spend(position_script_hash,
   position_policy_id)` to obtain `settlement_script_hash`.
6. Apply `market.market.spend(position_policy_id, settlement_script_hash)` to
   obtain `trading_script_hash`. The position policy already commits to the
   position script, so repeating that parameter here is unnecessary.
7. Apply `market_lifecycle.market_lifecycle.spend(trading_script_hash)` to
   obtain `lifecycle_script_hash`.
8. Independently apply `liquidity.liquidity.spend(lp_receipt_script_hash,
   lp_receipt_policy_id)` to obtain `liquidity_script_hash`.
9. Publish each applied validator as its own reference-script transaction and
   record every reference UTxO. Publishing one script per transaction retains
   margin beneath preprod's 16,384-byte maximum transaction size.
10. Submit one atomic bootstrap mint. Consume `seed_ref`, require
    `admin_pkh`, and use
    `Bootstrap { market_script_hash: lifecycle_script_hash,
    liquidity_script_hash }`. Create:
    - one `PendingActivation` market output at `lifecycle_script_hash` carrying
      exactly `MARKET_STATE`; and
    - one empty reserve output at `liquidity_script_hash` carrying exactly
      `LIQUIDITY_STATE`.

The policy checks the complete genesis datum pair, cross-links both assets and
the market id, rejects extra assets under its policy, and rejects reference
scripts or unrelated native assets in the state outputs. The unique NFTs then
authenticate every market/liquidity interaction; no admin wallet holds pooled
user or LP funds.

### Compiled size audit

`plutus.json` was regenerated after the phase split. Raw compiled-code sizes
(one entry per validator; the generated `.else` entries are identical) are:

| Validator | Raw bytes | Parameters |
| --- | ---: | ---: |
| `market.market.spend` | 11,621 | 2 |
| `market_settlement.market_settlement.spend` | 9,896 | 2 |
| `market_lifecycle.market_lifecycle.spend` | 6,808 | 1 |
| `liquidity.liquidity.spend` | 5,931 | 2 |
| `state_token.state_token.mint` | 5,182 | 2 |
| `position_token.position_token.mint` | 1,774 | 2 |
| `lp_receipt_token.lp_receipt_token.mint` | 1,539 | 2 |
| `position.position.spend` | 1,480 | 1 |
| `lp_receipt.lp_receipt.spend` | 1,269 | 1 |

Applying representative correctly shaped parameters produced 11,690 bytes for
trading, 9,966 for settlement, 6,843 for lifecycle, and 5,260 for the one-shot
policy. Actual deployment tooling must still serialize and size each complete
transaction before submission; do not bundle multiple large reference scripts
into one transaction.

## State transitions

### Market

Redeemer constructor order:

| Index | Constructor | Handler | Purpose |
| ---: | --- | --- | --- |
| 0 | `Activate` | lifecycle | Creator + admin move approved terms to price discovery. |
| 1 | `FinalizeOpening` | lifecycle | Commit 100 counts/root with the configured admin signature and sufficient referenced liquidity. |
| 2 | `BuyPosition` | trading | Add shares/collateral, pay 1% LP fee, and issue one position NFT. |
| 3 | `CashOut` | trading | Burn the complete owner position and pay exact reverse-curve value minus 1%. |
| 4 | `Resolve` | trading → settlement | Resolve YES/NO after trading with the configured admin signature and an evidence hash. |
| 5 | `Void` | trading → settlement | Permissionless VOID at/after the resolution timeout. |
| 6 | `Redeem` | settlement | Burn a winning or voided position and pay it once. |
| 7 | `FinalizeMarket` | settlement | Sweep remaining collateral to LP liquidity after claims complete or expire. |

Every transition consumes exactly one market state input and creates exactly
one inline-datum state output carrying its thread token. `Activate` remains at
the lifecycle address, `FinalizeOpening` moves to the trading address, and
`Resolve`/`Void` moves to the settlement address. The applied destination
hashes and unique NFT prevent an arbitrary script migration. Immutable terms,
non-ADA state value, base ADA, liabilities, collateral and position counts are
checked. Trades and cash-outs are strictly before
`trading_deadline_ms`; YES/NO resolution is between trading and resolution
deadlines; VOID is available at/after `resolution_deadline_ms`.

`FinalizeOpening` requires non-negative counts totaling exactly 100. The
opening tick is `bound(yes_count, 1, 99)`, so 100/0 opens 99/1 and 0/100 opens
1/99. For this MVP, the retained resolver fields must encode exactly the admin
key (`resolver_key_hashes = [admin_pkh]`) with threshold one. This keeps the
datum shape forward-compatible while making the current trust model explicit.

### Liquidity and LP receipts

LP deposits are permitted only while the authenticated market is in
`PriceDiscovery`. One lovelace contributes one LP unit because no trades or
fees exist during that phase. Deposit consumes the reserve state, adds the
value, and mints one owner-specific receipt NFT.

`ApplyTrade` mirrors the exact market transition, including the 1% fee and any
liquidity draw needed for appreciated cash-outs. `ApplyClaim` funds terminal
claims. `SettleLiquidity` accepts the market's remaining user collateral only
during `FinalizeMarket`. `RedeemLp` burns a complete owner receipt and pays its
pro-rata reserve share; the final receipt receives integer-division dust.

The admin signature provides no liquidity spending path.

### Positions

Every buy mints exactly one NFT whose asset name is the 1–32 byte
`position_id`. The minting policy requires the authenticated market input and
a matching `BuyPosition` redeemer. Cash-out/redemption must burn that NFT,
consume the matching inline datum, include the matching market redeemer, and
carry the owner's signature. The same pattern protects LP receipts.

## Curve

The curve operates on integer shares and a raw inventory pressure:

```text
raw tick = opening tick + YES quantity - NO quantity
display tick = clamp(raw tick, 1, 99)
```

Each incremental YES share costs its bounded YES tick percentage of
`payout_per_share`; NO uses the complementary percentage. The recursive table
supports at most 25 shares per position. `payout_per_share` must be divisible
by 10,000, making every tick cost and the 100-basis-point fee exact in lovelace.

Full cash-out walks the same table in reverse. With no intervening trade its
gross value exactly equals its buy cost; the separate 1% buy and cash-out fees
make a round trip strictly non-profitable. The market rejects any transition
where either outcome's worst-case liability exceeds combined user collateral
and market liquidity.

## Tests

The invariant suite deterministically checks every tick from 1 through 99 and
every supported position size from 1 through 25 for:

- tick bounds;
- monotonic YES/NO movement;
- YES/NO curve symmetry;
- exact buy/reverse-cash-out equality before fees;
- non-profitable immediate round trips;
- exact 1% fees;
- single configured admin resolver signature; and
- final-LP rounding behavior.

The bootstrap suite additionally checks a valid atomic mint, base-address seed
support, required admin signing, exact two-asset minting, designated-seed
consumption, and binding the initial state NFT to the supplied lifecycle hash.

This exhaustive deterministic test replaces a randomized fuzz dependency for
the hackathon package.

## Exact MVP limitations

- The separate README `FUNDING` phase is compressed: LPs fund during
  `PriceDiscovery`, then `FinalizeOpening` verifies minimum liquidity and opens
  `Trading` atomically.
- `amount_paid` is curve collateral excluding the separately recorded LP fee;
  VOID refunds that net amount so already-earned LP fees remain in the pool.
- Cash-out and LP redemption are complete-only. Create several small positions
  for staged exits.
- Losing positions cannot redeem. A market with losing/unclaimed tickets uses
  the claim deadline before terminal finalization.
- Forecast signature uniqueness and Merkle-tree construction remain off-chain;
  the contract commits the root/counts and requires the admin resolver
  signature.
- Applied-script publication, transaction construction, preprod submission,
  confirmation tracking, and a persisted deployment manifest are not yet
  implemented in this contracts package. The blueprint and on-chain bootstrap
  checks are present, but an off-chain deployer must perform the sequence above.
- Market transition coverage currently consists of curve/invariant tests plus
  direct bootstrap transaction-context tests; every market redeemer still
  needs full emulator transaction fixtures before production use.
- One market state UTxO serializes all trades and can produce stale quotes.
- The recursive curve is intentionally capped at 25 shares per position for
  predictable execution cost.
- No partial fills, order book, disputes, automated oracle, governance, or
  mainnet configuration is implemented.
- The code is testnet-only and has not received an independent security audit.
