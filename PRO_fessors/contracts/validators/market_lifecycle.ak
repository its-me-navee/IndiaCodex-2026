use aiken/crypto.{ScriptHash}
use aiken/primitive/bytearray
use cardano/transaction.{InlineDatum, OutputReference, Transaction}
use probx/curve
use probx/helpers
use probx/market_checks
use probx/types.{
  Activate, FinalizeOpening, LiquidityDatum, MarketDatum, MarketRedeemer,
  PendingActivation, PriceDiscovery, Trading,
}

/// Creation and opening phase. FinalizeOpening moves the unique market state
/// NFT to the applied trading validator.
validator market_lifecycle(trading_script_hash: ScriptHash) {
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

    let transition_checks = when redeemer is {
      Activate -> {
        let expected = MarketDatum { ..datum, status: PriceDiscovery }
        and {
          state_output.address == own_input.output.address,
          datum.status == PendingActivation,
          helpers.is_signed_by(self, datum.creator_pkh),
          helpers.is_signed_by(self, datum.admin_pkh),
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
          next_datum == expected,
          state_output.value == own_input.output.value,
        }
      }

      FinalizeOpening { poll_root, yes_count, no_count } -> {
        expect [liquidity_input] = helpers.inputs_with_asset(
          self.reference_inputs,
          datum.liquidity_thread_token,
        )
        expect InlineDatum(liquidity_data) = liquidity_input.output.datum
        expect liquidity_datum: LiquidityDatum = liquidity_data
        let opening_tick = curve.bound_tick(yes_count)
        let expected = MarketDatum {
          ..datum,
          opening_poll_root: poll_root,
          opening_yes_count: yes_count,
          opening_no_count: no_count,
          opening_tick,
          probability_tick: opening_tick,
          market_liquidity: liquidity_datum.reserve_lovelace,
          status: Trading,
        }

        and {
          market_checks.output_at_script(state_output, trading_script_hash),
          datum.status == PriceDiscovery,
          helpers.has_resolver_quorum(self, datum),
          bytearray.length(poll_root) > 0,
          yes_count >= 0,
          no_count >= 0,
          yes_count + no_count == 100,
          market_checks.valid_liquidity_state(liquidity_datum, datum),
          !liquidity_datum.settled,
          liquidity_datum.reserve_lovelace >= datum.curve_config.min_liquidity,
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
