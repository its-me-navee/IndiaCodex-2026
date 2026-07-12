use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{ScriptHash, VerificationKeyHash}
use aiken/primitive/bytearray
use cardano/address.{VerificationKey}
use cardano/assets.{PolicyId}
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
}
use probx/helpers
use probx/types.{
  AssetClass, CurveConfig, LiquidityDatum, MarketDatum, PendingActivation,
}

/// Fixed role names prevent a deployer from swapping or ambiguously naming
/// the two state NFTs. Uniqueness comes from the applied seed reference.
pub const market_state_asset_name = #"4d41524b45545f5354415445"

pub const liquidity_state_asset_name = #"4c49515549444954595f5354415445"

fn valid_market_genesis(
  datum: MarketDatum,
  admin_pkh: VerificationKeyHash,
  market_asset: AssetClass,
  liquidity_asset: AssetClass,
) -> Bool {
  and {
    helpers.well_formed_market(datum),
    bytearray.length(datum.market_id) > 0,
    bytearray.length(datum.terms_hash) > 0,
    bytearray.length(datum.metadata_hash) > 0,
    bytearray.length(datum.resolution_criteria_hash) > 0,
    datum.admin_pkh == admin_pkh,
    datum.market_thread_token == market_asset,
    datum.liquidity_thread_token == liquidity_asset,
    datum.status == PendingActivation,
    datum.opening_poll_root == "",
    datum.opening_yes_count == 0,
    datum.opening_no_count == 0,
    datum.opening_tick == 0,
    datum.probability_tick == 0,
    datum.yes_quantity == 0,
    datum.no_quantity == 0,
    datum.user_collateral == 0,
    datum.market_liquidity == 0,
    datum.yes_liability == 0,
    datum.no_liability == 0,
    datum.open_positions == 0,
    datum.resolution_outcome == None,
    datum.resolution_evidence_hash == None,
  }
}

fn valid_liquidity_genesis(
  datum: LiquidityDatum,
  market_datum: MarketDatum,
  market_asset: AssetClass,
  liquidity_asset: AssetClass,
) -> Bool {
  and {
    datum.market_id == market_datum.market_id,
    datum.market_thread_token == market_asset,
    datum.liquidity_thread_token == liquidity_asset,
    datum.base_lovelace > 0,
    datum.reserve_lovelace == 0,
    datum.total_lp_units == 0,
    datum.fees_accrued == 0,
    !datum.settled,
  }
}

/// Validate the complete atomic bootstrap transaction. The seed must be an
/// input controlled by the configured admin payment credential; requiring the
/// admin signature prevents a script-controlled or accidentally shared seed
/// from being raced. Exactly two assets exist under this one-shot policy.
pub fn validate(
  seed_ref: OutputReference,
  admin_pkh: VerificationKeyHash,
  market_script_hash: ScriptHash,
  liquidity_script_hash: ScriptHash,
  own_policy_id: PolicyId,
  self: Transaction,
) -> Bool {
  expect [seed_input] = self.inputs
    |> list.filter(fn(input) { input.output_reference == seed_ref })
  expect [market_output] = helpers.outputs_at_script(
    self.outputs,
    market_script_hash,
  )
  expect [liquidity_output] = helpers.outputs_at_script(
    self.outputs,
    liquidity_script_hash,
  )
  expect InlineDatum(market_data) = market_output.datum
  expect market_datum: MarketDatum = market_data
  expect InlineDatum(liquidity_data) = liquidity_output.datum
  expect liquidity_datum: LiquidityDatum = liquidity_data

  let market_asset = AssetClass {
    policy_id: own_policy_id,
    asset_name: market_state_asset_name,
  }
  let liquidity_asset = AssetClass {
    policy_id: own_policy_id,
    asset_name: liquidity_state_asset_name,
  }
  let own_token_count = assets.tokens(self.mint, own_policy_id)
    |> dict.to_pairs
    |> list.length

  and {
    market_script_hash != liquidity_script_hash,
    seed_input.output.address.payment_credential == VerificationKey(admin_pkh),
    helpers.is_signed_by(self, admin_pkh),
    own_token_count == 2,
    assets.quantity_of(self.mint, own_policy_id, market_state_asset_name) == 1,
    assets.quantity_of(self.mint, own_policy_id, liquidity_state_asset_name) == 1,
    assets.without_lovelace(market_output.value) == assets.from_asset(
      own_policy_id,
      market_state_asset_name,
      1,
    ),
    assets.without_lovelace(liquidity_output.value) == assets.from_asset(
      own_policy_id,
      liquidity_state_asset_name,
      1,
    ),
    market_output.reference_script == None,
    liquidity_output.reference_script == None,
    assets.lovelace_of(market_output.value) == market_datum.state_base_lovelace,
    assets.lovelace_of(liquidity_output.value) == liquidity_datum.base_lovelace,
    valid_market_genesis(market_datum, admin_pkh, market_asset, liquidity_asset),
    valid_liquidity_genesis(
      liquidity_datum,
      market_datum,
      market_asset,
      liquidity_asset,
    ),
  }
}

const admin = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const other_admin = #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

const policy = #"cccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

const market_hash = #"dddddddddddddddddddddddddddddddddddddddddddddddddddddddd"

const liquidity_hash =
  #"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

const seed =
  OutputReference {
    transaction_id: #"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    output_index: 0,
  }

fn market_fixture() -> MarketDatum {
  MarketDatum {
    market_id: #"01",
    terms_hash: #"02",
    metadata_hash: #"03",
    creator_pkh: admin,
    admin_pkh: admin,
    resolver_key_hashes: [admin],
    resolver_threshold: 1,
    trading_deadline_ms: 1_000,
    resolution_deadline_ms: 2_000,
    claim_deadline_ms: 3_000,
    resolution_criteria_hash: #"04",
    opening_poll_root: "",
    opening_yes_count: 0,
    opening_no_count: 0,
    opening_tick: 0,
    probability_tick: 0,
    yes_quantity: 0,
    no_quantity: 0,
    curve_config: CurveConfig {
      payout_per_share: 10_000_000,
      max_shares_per_position: 25,
      min_liquidity: 100_000_000,
    },
    user_collateral: 0,
    market_liquidity: 0,
    yes_liability: 0,
    no_liability: 0,
    liquidity_fee_bps: 100,
    open_positions: 0,
    state_base_lovelace: 2_000_000,
    status: PendingActivation,
    resolution_outcome: None,
    resolution_evidence_hash: None,
    market_thread_token: AssetClass {
      policy_id: policy,
      asset_name: market_state_asset_name,
    },
    liquidity_thread_token: AssetClass {
      policy_id: policy,
      asset_name: liquidity_state_asset_name,
    },
  }
}

fn liquidity_fixture() -> LiquidityDatum {
  LiquidityDatum {
    market_id: #"01",
    market_thread_token: AssetClass {
      policy_id: policy,
      asset_name: market_state_asset_name,
    },
    liquidity_thread_token: AssetClass {
      policy_id: policy,
      asset_name: liquidity_state_asset_name,
    },
    base_lovelace: 2_000_000,
    reserve_lovelace: 0,
    total_lp_units: 0,
    fees_accrued: 0,
    settled: False,
  }
}

fn seed_input(reference: OutputReference) -> Input {
  Input {
    output_reference: reference,
    output: Output {
      address: address.from_verification_key(admin),
      value: assets.from_lovelace(5_000_000),
      datum: NoDatum,
      reference_script: None,
    },
  }
}

fn transaction_fixture() -> Transaction {
  let market_datum = market_fixture()
  let liquidity_datum = liquidity_fixture()
  let minted = assets.from_asset(policy, market_state_asset_name, 1)
    |> assets.add(policy, liquidity_state_asset_name, 1)
  let market_value = assets.from_lovelace(market_datum.state_base_lovelace)
    |> assets.add(policy, market_state_asset_name, 1)
  let liquidity_value = assets.from_lovelace(liquidity_datum.base_lovelace)
    |> assets.add(policy, liquidity_state_asset_name, 1)

  Transaction {
    ..transaction.placeholder,
    inputs: [seed_input(seed)],
    outputs: [
      Output {
        address: address.from_script(market_hash),
        value: market_value,
        datum: InlineDatum(market_datum),
        reference_script: None,
      },
      Output {
        address: address.from_script(liquidity_hash),
        value: liquidity_value,
        datum: InlineDatum(liquidity_datum),
        reference_script: None,
      },
    ],
    mint: minted,
    extra_signatories: [admin],
  }
}

test valid_atomic_state_bootstrap() {
  validate(
    seed,
    admin,
    market_hash,
    liquidity_hash,
    policy,
    transaction_fixture(),
  )
}

test bootstrap_accepts_admin_base_address_seed() {
  let valid = transaction_fixture()
  expect [enterprise_seed] = valid.inputs
  let base_seed = Input {
    ..enterprise_seed,
    output: Output {
      ..enterprise_seed.output,
      address: enterprise_seed.output.address
        |> address.with_delegation_key(other_admin),
    },
  }
  let with_base_seed = Transaction { ..valid, inputs: [base_seed] }
  validate(seed, admin, market_hash, liquidity_hash, policy, with_base_seed)
}

test bootstrap_rejects_non_admin_signer() {
  let invalid = Transaction {
    ..transaction_fixture(),
    extra_signatories: [other_admin],
  }
  !validate(seed, admin, market_hash, liquidity_hash, policy, invalid)
}

test bootstrap_rejects_extra_policy_asset() {
  let valid = transaction_fixture()
  let invalid = Transaction {
    ..valid,
    mint: valid.mint |> assets.add(policy, #"00", 1),
  }
  !validate(seed, admin, market_hash, liquidity_hash, policy, invalid)
}

test bootstrap_requires_the_designated_seed() fail {
  let wrong_seed = OutputReference { ..seed, output_index: 1 }
  validate(
    wrong_seed,
    admin,
    market_hash,
    liquidity_hash,
    policy,
    transaction_fixture(),
  )
}

test bootstrap_binds_the_market_destination() fail {
  validate(
    seed,
    admin,
    other_admin,
    liquidity_hash,
    policy,
    transaction_fixture(),
  )
}
