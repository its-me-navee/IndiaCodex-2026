use probx/types.{CurveConfig, No, Outcome, Yes}

pub const min_tick = 1

pub const max_tick = 99

pub const fee_denominator = 10_000

pub fn bound_tick(raw_tick: Int) -> Int {
  if raw_tick < min_tick {
    min_tick
  } else if raw_tick > max_tick {
    max_tick
  } else {
    raw_tick
  }
}

pub fn raw_tick(opening_tick: Int, yes_quantity: Int, no_quantity: Int) -> Int {
  opening_tick + yes_quantity - no_quantity
}

pub fn current_tick(
  opening_tick: Int,
  yes_quantity: Int,
  no_quantity: Int,
) -> Int {
  bound_tick(raw_tick(opening_tick, yes_quantity, no_quantity))
}

fn sum_buy_ticks(outcome: Outcome, raw: Int, shares: Int) -> Int {
  if shares == 0 {
    0
  } else {
    when outcome is {
      Yes -> bound_tick(raw + shares) + sum_buy_ticks(outcome, raw, shares - 1)
      No ->
        100 - bound_tick(raw - shares) + sum_buy_ticks(outcome, raw, shares - 1)
    }
  }
}

fn sum_cashout_ticks(outcome: Outcome, raw: Int, shares: Int) -> Int {
  if shares == 0 {
    0
  } else {
    when outcome is {
      Yes ->
        bound_tick(raw - shares + 1) + sum_cashout_ticks(
          outcome,
          raw,
          shares - 1,
        )
      No ->
        100 - bound_tick(raw + shares - 1) + sum_cashout_ticks(
          outcome,
          raw,
          shares - 1,
        )
    }
  }
}

pub fn valid_config(config: CurveConfig) -> Bool {
  and {
    config.payout_per_share > 0,
    config.payout_per_share % fee_denominator == 0,
    config.max_shares_per_position > 0,
    config.max_shares_per_position <= 25,
    config.min_liquidity > 0,
  }
}

/// Exact curve cost for adding `shares` at the current raw inventory pressure.
pub fn buy_cost(
  config: CurveConfig,
  outcome: Outcome,
  opening_tick: Int,
  yes_quantity: Int,
  no_quantity: Int,
  shares: Int,
) -> Int {
  let raw = raw_tick(opening_tick, yes_quantity, no_quantity)
  config.payout_per_share / 100 * sum_buy_ticks(outcome, raw, shares)
}

/// Exact reverse-curve gross value for removing a complete position.
pub fn cashout_value(
  config: CurveConfig,
  outcome: Outcome,
  opening_tick: Int,
  yes_quantity: Int,
  no_quantity: Int,
  shares: Int,
) -> Int {
  let raw = raw_tick(opening_tick, yes_quantity, no_quantity)
  config.payout_per_share / 100 * sum_cashout_ticks(outcome, raw, shares)
}

pub fn liquidity_fee(amount: Int, fee_bps: Int) -> Int {
  amount * fee_bps / fee_denominator
}

pub fn next_quantities(
  outcome: Outcome,
  yes_quantity: Int,
  no_quantity: Int,
  shares_delta: Int,
) -> (Int, Int) {
  when outcome is {
    Yes -> (yes_quantity + shares_delta, no_quantity)
    No -> (yes_quantity, no_quantity + shares_delta)
  }
}
