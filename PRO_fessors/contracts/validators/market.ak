use aiken/crypto.{ScriptHash}
use aiken/interval
use aiken/primitive/bytearray
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, OutputReference, Transaction}
use probx/curve
use probx/helpers
use probx/market_checks
use probx/types.{
  BuyPosition, CashOut, LiquidityDatum, MarketDatum, MarketRedeemer, No,
  PositionDatum, Resolve, Resolved, ResolvedNo, ResolvedVoid, ResolvedYes,
  Trading, Void, Voided, Yes,
}

/// Trading phase. Resolve and Void move the unique market state NFT to the
/// applied settlement validator.
validator market(
  position_policy_id: PolicyId,
  settlement_script_hash: ScriptHash,
) {
  spend(
    datum_opt: Option<MarketDatum>,
    redeemer: MarketRedeemer,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(datum) = datum_opt
    expect [own_input] = helpers.inputs_with_asset(
      self.inputs,
      datum.market_thread_token,
    )
    expect [state_output] = helpers.outputs_with_asset(
      self.outputs,
      datum.market_thread_token,
    )
    expect InlineDatum(next_data) = state_output.datum
    expect next_datum: MarketDatum = next_data

    let input_lovelace = assets.lovelace_of(own_input.output.value)
    let output_lovelace = assets.lovelace_of(state_output.value)
    let stays_trading = state_output.address == own_input.output.address

    let transition_checks = when redeemer is {
      BuyPosition { position } -> {
        let shares = position.shares
        let (next_yes, next_no) = curve.next_quantities(
          position.outcome,
          datum.yes_quantity,
          datum.no_quantity,
          shares,
        )
        let cost = curve.buy_cost(
          datum.curve_config,
          position.outcome,
          datum.opening_tick,
          datum.yes_quantity,
          datum.no_quantity,
          shares,
        )
        let fee = curve.liquidity_fee(cost, datum.liquidity_fee_bps)
        let next_tick = curve.current_tick(
          datum.opening_tick,
          next_yes,
          next_no,
        )
        expect [liquidity_input] = helpers.inputs_with_asset(
          self.inputs,
          datum.liquidity_thread_token,
        )
        expect [liquidity_output] = helpers.outputs_with_asset(
          self.outputs,
          datum.liquidity_thread_token,
        )
        expect InlineDatum(old_liquidity_data) = liquidity_input.output.datum
        expect old_liquidity: LiquidityDatum = old_liquidity_data
        expect InlineDatum(next_liquidity_data) = liquidity_output.datum
        expect next_liquidity: LiquidityDatum = next_liquidity_data

        let expected_position = PositionDatum {
          ..position,
          amount_paid: cost,
          fee_paid: fee,
          entry_probability_tick: next_tick,
          maximum_payout: shares * datum.curve_config.payout_per_share,
        }
        let updated_market = MarketDatum {
          ..datum,
          probability_tick: next_tick,
          yes_quantity: next_yes,
          no_quantity: next_no,
          user_collateral: datum.user_collateral + cost,
          market_liquidity: datum.market_liquidity + fee,
          open_positions: datum.open_positions + 1,
        }
          |> market_checks.with_side_liability(
              position.outcome,
              expected_position.maximum_payout,
            )

        and {
          stays_trading,
          datum.status == Trading,
          interval.is_entirely_before(
            self.validity_range,
            datum.trading_deadline_ms,
          ),
          helpers.is_signed_by(self, position.owner_pkh),
          market_checks.valid_position_shape(
            expected_position,
            datum,
            position_policy_id,
          ),
          position == expected_position,
          assets.quantity_of(
            self.mint,
            position_policy_id,
            position.position_id,
          ) == 1,
          market_checks.valid_liquidity_state(old_liquidity, datum),
          old_liquidity.reserve_lovelace == datum.market_liquidity,
          next_liquidity.fees_accrued == old_liquidity.fees_accrued + fee,
          next_datum == updated_market,
          output_lovelace == input_lovelace + cost,
        }
      }

      CashOut { position } -> {
        let shares = position.shares
        let (next_yes, next_no) = curve.next_quantities(
          position.outcome,
          datum.yes_quantity,
          datum.no_quantity,
          -shares,
        )
        let gross = curve.cashout_value(
          datum.curve_config,
          position.outcome,
          datum.opening_tick,
          datum.yes_quantity,
          datum.no_quantity,
          shares,
        )
        let fee = curve.liquidity_fee(gross, datum.liquidity_fee_bps)
        let payout = gross - fee
        let market_draw = helpers.min(gross, datum.user_collateral)
        let liquidity_draw = gross - market_draw
        let liquidity_delta = fee - liquidity_draw
        expect [liquidity_input] = helpers.inputs_with_asset(
          self.inputs,
          datum.liquidity_thread_token,
        )
        expect [liquidity_output] = helpers.outputs_with_asset(
          self.outputs,
          datum.liquidity_thread_token,
        )
        expect InlineDatum(old_liquidity_data) = liquidity_input.output.datum
        expect old_liquidity: LiquidityDatum = old_liquidity_data
        expect InlineDatum(next_liquidity_data) = liquidity_output.datum
        expect next_liquidity: LiquidityDatum = next_liquidity_data
        let updated_market = MarketDatum {
          ..datum,
          probability_tick: curve.current_tick(
            datum.opening_tick,
            next_yes,
            next_no,
          ),
          yes_quantity: next_yes,
          no_quantity: next_no,
          user_collateral: datum.user_collateral - market_draw,
          market_liquidity: datum.market_liquidity + liquidity_delta,
          open_positions: datum.open_positions - 1,
        }
          |> market_checks.with_side_liability(
              position.outcome,
              -position.maximum_payout,
            )

        and {
          stays_trading,
          datum.status == Trading,
          interval.is_entirely_before(
            self.validity_range,
            datum.trading_deadline_ms,
          ),
          market_checks.valid_position_shape(
            position,
            datum,
            position_policy_id,
          ),
          assets.quantity_of(
            self.mint,
            position_policy_id,
            position.position_id,
          ) == -1,
          datum.open_positions > 0,
          market_checks.side_liability(datum, position.outcome) >= position.maximum_payout,
          datum.yes_quantity >= if position.outcome == Yes {
            shares
          } else {
            0
          },
          datum.no_quantity >= if position.outcome == No {
            shares
          } else {
            0
          },
          gross > fee,
          liquidity_draw <= old_liquidity.reserve_lovelace,
          market_checks.valid_liquidity_state(old_liquidity, datum),
          old_liquidity.reserve_lovelace == datum.market_liquidity,
          next_liquidity.fees_accrued == old_liquidity.fees_accrued + fee,
          next_datum == updated_market,
          output_lovelace == input_lovelace - market_draw,
          helpers.paid_lovelace_to(self.outputs, position.owner_pkh) >= payout,
        }
      }

      Resolve { outcome, evidence_hash } -> {
        let resolution = when outcome is {
          Yes -> ResolvedYes
          No -> ResolvedNo
        }
        let expected = when outcome is {
          Yes ->
            MarketDatum {
              ..datum,
              no_liability: 0,
              status: Resolved,
              resolution_outcome: Some(resolution),
              resolution_evidence_hash: Some(evidence_hash),
            }
          No ->
            MarketDatum {
              ..datum,
              yes_liability: 0,
              status: Resolved,
              resolution_outcome: Some(resolution),
              resolution_evidence_hash: Some(evidence_hash),
            }
        }
        and {
          market_checks.output_at_script(state_output, settlement_script_hash),
          datum.status == Trading,
          interval.after(datum.trading_deadline_ms)
            |> interval.includes(self.validity_range),
          interval.is_entirely_before(
            self.validity_range,
            datum.resolution_deadline_ms,
          ),
          helpers.has_resolver_quorum(self, datum),
          bytearray.length(evidence_hash) > 0,
          next_datum == expected,
          state_output.value == own_input.output.value,
        }
      }

      Void -> {
        let expected = MarketDatum {
          ..datum,
          status: Voided,
          resolution_outcome: Some(ResolvedVoid),
          resolution_evidence_hash: None,
        }
        and {
          market_checks.output_at_script(state_output, settlement_script_hash),
          datum.status == Trading,
          interval.after(datum.resolution_deadline_ms)
            |> interval.includes(self.validity_range),
          next_datum == expected,
          state_output.value == own_input.output.value,
        }
      }

      _ -> False
    }

    market_checks.common_state_checks(
      datum,
      next_datum,
      own_ref,
      own_input,
      state_output,
      self,
    ) && transition_checks
  }

  else(_) {
    fail
  }
}
