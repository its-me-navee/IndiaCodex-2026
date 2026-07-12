use probx/curve
use probx/helpers
use probx/types.{CurveConfig, No, Yes}

const resolver_a = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const resolver_b = #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

const config =
  CurveConfig {
    payout_per_share: 10_000_000,
    max_shares_per_position: 25,
    min_liquidity: 100_000_000,
  }

fn check_share_invariants(tick: Int, shares: Int) -> Bool {
  if shares > config.max_shares_per_position {
    True
  } else {
    let yes_buy = curve.buy_cost(config, Yes, tick, 0, 0, shares)
    let yes_cashout = curve.cashout_value(config, Yes, tick, shares, 0, shares)
    let no_buy = curve.buy_cost(config, No, tick, 0, 0, shares)
    let no_cashout = curve.cashout_value(config, No, tick, 0, shares, shares)
    let symmetric_no = curve.buy_cost(config, No, 100 - tick, 0, 0, shares)
    let yes_fee = curve.liquidity_fee(yes_buy, 100)
    let no_fee = curve.liquidity_fee(no_buy, 100)

    and {
      yes_buy == yes_cashout,
      no_buy == no_cashout,
      yes_buy == symmetric_no,
      yes_cashout - yes_fee <= yes_buy + yes_fee,
      no_cashout - no_fee <= no_buy + no_fee,
      check_share_invariants(tick, shares + 1),
    }
  }
}

fn check_every_tick(tick: Int) -> Bool {
  if tick > curve.max_tick {
    True
  } else {
    and {
      curve.bound_tick(tick) >= curve.min_tick,
      curve.bound_tick(tick) <= curve.max_tick,
      curve.current_tick(tick, 1, 0) >= tick,
      curve.current_tick(tick, 0, 1) <= tick,
      check_share_invariants(tick, 1),
      check_every_tick(tick + 1),
    }
  }
}

test opening_probability_is_bounded() {
  and {
    curve.bound_tick(0) == 1,
    curve.bound_tick(1) == 1,
    curve.bound_tick(50) == 50,
    curve.bound_tick(99) == 99,
    curve.bound_tick(100) == 99,
  }
}

/// Deterministic property test over all 99 ticks and every permitted position
/// size. This avoids a test-only fuzz dependency while covering the full table.
test exhaustive_curve_bounds_symmetry_and_round_trip() {
  check_every_tick(curve.min_tick)
}

test exact_one_percent_fee() {
  curve.liquidity_fee(10_000_000, 100) == 100_000
}

test resolver_requires_the_single_admin_signature() {
  and {
    !helpers.signed_key_quorum([], [resolver_a], 1),
    helpers.signed_key_quorum([resolver_a], [resolver_a], 1),
    !helpers.signed_key_quorum([resolver_b], [resolver_a], 1),
    helpers.single_admin_resolver([resolver_a], resolver_a),
    !helpers.single_admin_resolver([], resolver_a),
    !helpers.single_admin_resolver([resolver_a, resolver_a], resolver_a),
    !helpers.single_admin_resolver([resolver_b], resolver_a),
  }
}

test final_lp_gets_rounding_remainder() {
  and {
    helpers.pro_rata_share(101, 1, 3) == 33,
    helpers.pro_rata_share(68, 2, 2) == 68,
  }
}
