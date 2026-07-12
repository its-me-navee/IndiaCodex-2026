use aiken/crypto.{ScriptHash}
use aiken/interval
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, OutputReference, Transaction}
use probx/curve
use probx/helpers
use probx/market_checks
use probx/types.{
  AssetClass, FinalizeMarket, LiquidityDatum, MarketDatum, MarketRedeemer,
  PositionDatum, Redeem, Resolved, ResolvedNo, ResolvedVoid, ResolvedYes,
  Settled, Voided, Yes,
}

/// Terminal phase for an authenticated market. The active validator moves the
/// unique market state NFT here only through Resolve or Void.
validator market_settlement(
  position_script_hash: ScriptHash,
  position_policy_id: PolicyId,
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

    let transition_checks = when redeemer is {
      Redeem { position } -> {
        let winning = when (datum.status, datum.resolution_outcome) is {
          (Resolved, Some(ResolvedYes)) -> position.outcome == Yes
          (Resolved, Some(ResolvedNo)) -> position.outcome != Yes
          (Voided, Some(ResolvedVoid)) -> True
          _ -> False
        }
        let payout = if datum.status == Voided {
          position.amount_paid
        } else {
          position.maximum_payout
        }
        let market_draw = helpers.min(payout, datum.user_collateral)
        let liquidity_draw = payout - market_draw
        let position_asset = AssetClass {
          policy_id: position_policy_id,
          asset_name: position.position_id,
        }
        expect [position_input] = helpers.inputs_at_script(
          self.inputs,
          position_script_hash,
        )
        expect InlineDatum(position_data) = position_input.output.datum
        expect input_position: PositionDatum = position_data
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
        let expected_liquidity = LiquidityDatum {
          ..old_liquidity,
          reserve_lovelace: old_liquidity.reserve_lovelace - liquidity_draw,
        }
        let (next_yes, next_no) = curve.next_quantities(
          position.outcome,
          datum.yes_quantity,
          datum.no_quantity,
          -position.shares,
        )
        let updated_market = MarketDatum {
          ..datum,
          yes_quantity: next_yes,
          no_quantity: next_no,
          user_collateral: datum.user_collateral - market_draw,
          market_liquidity: datum.market_liquidity - liquidity_draw,
          open_positions: datum.open_positions - 1,
        }
          |> market_checks.with_side_liability(
              position.outcome,
              -position.maximum_payout,
            )

        and {
          state_output.address == own_input.output.address,
          winning,
          market_checks.valid_position_shape(
            position,
            datum,
            position_policy_id,
          ),
          input_position == position,
          helpers.is_signed_by(self, position.owner_pkh),
          helpers.quantity(position_input.output.value, position_asset) == 1,
          assets.quantity_of(
            self.mint,
            position_policy_id,
            position.position_id,
          ) == -1,
          datum.open_positions > 0,
          market_checks.side_liability(datum, position.outcome) >= position.maximum_payout,
          datum.yes_quantity >= if position.outcome == Yes {
            position.shares
          } else {
            0
          },
          datum.no_quantity >= if position.outcome != Yes {
            position.shares
          } else {
            0
          },
          liquidity_draw <= old_liquidity.reserve_lovelace,
          market_checks.valid_liquidity_state(old_liquidity, datum),
          old_liquidity.reserve_lovelace == datum.market_liquidity,
          liquidity_output.address == liquidity_input.output.address,
          next_liquidity == expected_liquidity,
          assets.lovelace_of(liquidity_output.value) == assets.lovelace_of(
            liquidity_input.output.value,
          ) - liquidity_draw,
          next_datum == updated_market,
          output_lovelace == input_lovelace - market_draw,
          helpers.paid_lovelace_to(self.outputs, position.owner_pkh) >= payout,
        }
      }

      FinalizeMarket -> {
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
        let swept_collateral = datum.user_collateral
        let expected_liquidity = LiquidityDatum {
          ..old_liquidity,
          reserve_lovelace: old_liquidity.reserve_lovelace + swept_collateral,
          settled: True,
        }
        let expected = MarketDatum {
          ..datum,
          yes_quantity: 0,
          no_quantity: 0,
          user_collateral: 0,
          market_liquidity: datum.market_liquidity + swept_collateral,
          yes_liability: 0,
          no_liability: 0,
          open_positions: 0,
          status: Settled,
        }
        let claims_expired = interval.after(datum.claim_deadline_ms)
          |> interval.includes(self.validity_range)

        and {
          state_output.address == own_input.output.address,
          datum.status == Resolved || datum.status == Voided,
          datum.open_positions == 0 || claims_expired,
          market_checks.valid_liquidity_state(old_liquidity, datum),
          !old_liquidity.settled,
          old_liquidity.reserve_lovelace == datum.market_liquidity,
          liquidity_output.address == liquidity_input.output.address,
          next_liquidity == expected_liquidity,
          assets.lovelace_of(liquidity_output.value) == assets.lovelace_of(
            liquidity_input.output.value,
          ) + swept_collateral,
          next_datum == expected,
          output_lovelace == datum.state_base_lovelace,
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
