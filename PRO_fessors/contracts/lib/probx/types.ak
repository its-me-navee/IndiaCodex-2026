use aiken/crypto.{ScriptHash, VerificationKeyHash}
use cardano/assets.{AssetName, PolicyId}

/// An authenticated state token. Each deployed market uses distinct market
/// and liquidity thread-token names under a one-shot policy.
pub type AssetClass {
  policy_id: PolicyId,
  asset_name: AssetName,
}

pub type Outcome {
  Yes
  No
}

pub type ResolutionOutcome {
  ResolvedYes
  ResolvedNo
  ResolvedVoid
}

pub type MarketStatus {
  PendingActivation
  PriceDiscovery
  Trading
  Resolved
  Voided
  Settled
}

/// Integer-only curve configuration. `payout_per_share` must be divisible by
/// 10,000 so every 1%-99% marginal price and 1% fee is exact in lovelace.
pub type CurveConfig {
  payout_per_share: Int,
  max_shares_per_position: Int,
  min_liquidity: Int,
}

/// Single market state. The extra base/counter fields make value conservation
/// and terminal settlement explicit while retaining the README's fields.
pub type MarketDatum {
  market_id: ByteArray,
  terms_hash: ByteArray,
  metadata_hash: ByteArray,
  creator_pkh: VerificationKeyHash,
  admin_pkh: VerificationKeyHash,
  resolver_key_hashes: List<VerificationKeyHash>,
  resolver_threshold: Int,
  trading_deadline_ms: Int,
  resolution_deadline_ms: Int,
  claim_deadline_ms: Int,
  resolution_criteria_hash: ByteArray,
  opening_poll_root: ByteArray,
  opening_yes_count: Int,
  opening_no_count: Int,
  opening_tick: Int,
  probability_tick: Int,
  yes_quantity: Int,
  no_quantity: Int,
  curve_config: CurveConfig,
  user_collateral: Int,
  market_liquidity: Int,
  yes_liability: Int,
  no_liability: Int,
  liquidity_fee_bps: Int,
  open_positions: Int,
  state_base_lovelace: Int,
  status: MarketStatus,
  resolution_outcome: Option<ResolutionOutcome>,
  resolution_evidence_hash: Option<ByteArray>,
  market_thread_token: AssetClass,
  liquidity_thread_token: AssetClass,
}

/// One full-cash-out/full-redemption prediction ticket.
pub type PositionDatum {
  market_id: ByteArray,
  owner_pkh: VerificationKeyHash,
  outcome: Outcome,
  shares: Int,
  amount_paid: Int,
  fee_paid: Int,
  entry_probability_tick: Int,
  maximum_payout: Int,
  position_policy_id: PolicyId,
  position_id: ByteArray,
  market_thread_token: AssetClass,
}

pub type LiquidityDatum {
  market_id: ByteArray,
  market_thread_token: AssetClass,
  liquidity_thread_token: AssetClass,
  base_lovelace: Int,
  reserve_lovelace: Int,
  total_lp_units: Int,
  fees_accrued: Int,
  settled: Bool,
}

pub type LpReceiptDatum {
  market_id: ByteArray,
  owner_pkh: VerificationKeyHash,
  units: Int,
  receipt_policy_id: PolicyId,
  receipt_id: ByteArray,
  market_thread_token: AssetClass,
  liquidity_thread_token: AssetClass,
}

/// Constructor order is an off-chain API and is documented in README.md.
pub type MarketRedeemer {
  Activate
  FinalizeOpening { poll_root: ByteArray, yes_count: Int, no_count: Int }
  BuyPosition { position: PositionDatum }
  CashOut { position: PositionDatum }
  Resolve { outcome: Outcome, evidence_hash: ByteArray }
  Void
  Redeem { position: PositionDatum }
  FinalizeMarket
}

pub type LiquidityRedeemer {
  Deposit { receipt: LpReceiptDatum, amount: Int }
  ApplyTrade { reserve_delta: Int, fee: Int }
  ApplyClaim { reserve_delta: Int }
  SettleLiquidity
  RedeemLp { receipt: LpReceiptDatum }
}

pub type PositionRedeemer {
  SpendPosition
}

pub type LpReceiptRedeemer {
  SpendLpReceipt
}

pub type PositionTokenRedeemer {
  IssuePosition { position: PositionDatum }
  BurnPosition { position: PositionDatum }
}

pub type LpReceiptTokenRedeemer {
  IssueLpReceipt { receipt: LpReceiptDatum }
  BurnLpReceipt { receipt: LpReceiptDatum }
}

/// The final state-validator hashes are supplied at the one-shot mint. They
/// cannot be static policy parameters because the state policy id is itself a
/// dependency of the applied position and market validators.
pub type BootstrapRedeemer {
  Bootstrap {
    market_script_hash: ScriptHash,
    liquidity_script_hash: ScriptHash,
  }
}
