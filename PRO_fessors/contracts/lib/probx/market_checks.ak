use aiken/crypto.{ScriptHash}
use aiken/primitive/bytearray
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{Input, Output, OutputReference, Transaction}
use probx/helpers
use probx/types.{LiquidityDatum, MarketDatum, Outcome, PositionDatum, Yes}

pub fn valid_position_shape(
  position: PositionDatum,
  datum: MarketDatum,
  position_policy_id: PolicyId,
) -> Bool {
  and {
    position.market_id == datum.market_id,
    position.market_thread_token == datum.market_thread_token,
    position.shares > 0,
    position.shares <= datum.curve_config.max_shares_per_position,
    position.amount_paid > 0,
    position.fee_paid >= 0,
    position.maximum_payout == position.shares * datum.curve_config.payout_per_share,
    position.position_policy_id == position_policy_id,
    bytearray.length(position.position_id) > 0,
    bytearray.length(position.position_id) <= 32,
  }
}

pub fn side_liability(datum: MarketDatum, outcome: Outcome) -> Int {
  when outcome is {
    Yes -> datum.yes_liability
    _ -> datum.no_liability
  }
}

pub fn with_side_liability(
  datum: MarketDatum,
  outcome: Outcome,
  delta: Int,
) -> MarketDatum {
  when outcome is {
    Yes -> MarketDatum { ..datum, yes_liability: datum.yes_liability + delta }
    _ -> MarketDatum { ..datum, no_liability: datum.no_liability + delta }
  }
}

pub fn valid_liquidity_state(
  datum: LiquidityDatum,
  market_datum: MarketDatum,
) -> Bool {
  and {
    datum.market_id == market_datum.market_id,
    datum.market_thread_token == market_datum.market_thread_token,
    datum.liquidity_thread_token == market_datum.liquidity_thread_token,
    datum.base_lovelace > 0,
    datum.reserve_lovelace >= 0,
    datum.total_lp_units >= 0,
    datum.fees_accrued >= 0,
  }
}

pub fn common_state_checks(
  datum: MarketDatum,
  next_datum: MarketDatum,
  own_ref: OutputReference,
  own_input: Input,
  state_output: Output,
  self: Transaction,
) -> Bool {
  and {
    own_input.output_reference == own_ref,
    helpers.well_formed_market(datum),
    helpers.well_formed_market(next_datum),
    helpers.immutable_terms_unchanged(datum, next_datum),
    helpers.quantity(own_input.output.value, datum.market_thread_token) == 1,
    helpers.quantity(state_output.value, datum.market_thread_token) == 1,
    assets.quantity_of(
      self.mint,
      datum.market_thread_token.policy_id,
      datum.market_thread_token.asset_name,
    ) == 0,
    assets.lovelace_of(own_input.output.value) == datum.state_base_lovelace + datum.user_collateral,
    assets.lovelace_of(state_output.value) == next_datum.state_base_lovelace + next_datum.user_collateral,
    assets.without_lovelace(own_input.output.value) == assets.without_lovelace(
      state_output.value,
    ),
  }
}

pub fn output_at_script(output: Output, script_hash: ScriptHash) -> Bool {
  output.address.payment_credential == Script(script_hash)
}
