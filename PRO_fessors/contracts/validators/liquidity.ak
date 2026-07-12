use aiken/crypto.{ScriptHash}
use aiken/primitive/bytearray
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, OutputReference, Transaction}
use probx/helpers
use probx/types.{
  ApplyClaim, ApplyTrade, AssetClass, Deposit, LiquidityDatum, LiquidityRedeemer,
  LpReceiptDatum, MarketDatum, PriceDiscovery, RedeemLp, Resolved,
  SettleLiquidity, Settled, Trading, Voided,
}

fn well_formed(datum: LiquidityDatum) -> Bool {
  and {
    datum.base_lovelace > 0,
    datum.reserve_lovelace >= 0,
    datum.total_lp_units >= 0,
    datum.fees_accrued >= 0,
    datum.total_lp_units > 0 || datum.reserve_lovelace == 0,
  }
}

fn receipt_matches(
  receipt: LpReceiptDatum,
  datum: LiquidityDatum,
  lp_receipt_policy_id: PolicyId,
) -> Bool {
  and {
    receipt.market_id == datum.market_id,
    receipt.market_thread_token == datum.market_thread_token,
    receipt.liquidity_thread_token == datum.liquidity_thread_token,
    receipt.receipt_policy_id == lp_receipt_policy_id,
    receipt.units > 0,
    bytearray.length(receipt.receipt_id) > 0,
    bytearray.length(receipt.receipt_id) <= 32,
  }
}

validator liquidity(
  lp_receipt_script_hash: ScriptHash,
  lp_receipt_policy_id: PolicyId,
) {
  spend(
    datum_opt: Option<LiquidityDatum>,
    redeemer: LiquidityRedeemer,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(datum) = datum_opt
    let own_input = transaction.resolve_input(self.inputs, own_ref)
    expect [only_own_input] = helpers.inputs_at(self.inputs, own_input.address)
    expect [continuing_output] = helpers.outputs_at(
      self.outputs,
      own_input.address,
    )
    expect InlineDatum(next_data) = continuing_output.datum
    expect next_datum: LiquidityDatum = next_data
    let input_lovelace = assets.lovelace_of(own_input.value)
    let output_lovelace = assets.lovelace_of(continuing_output.value)
    let common_checks = and {
      only_own_input.output_reference == own_ref,
      well_formed(datum),
      well_formed(next_datum),
      datum.market_id == next_datum.market_id,
      datum.market_thread_token == next_datum.market_thread_token,
      datum.liquidity_thread_token == next_datum.liquidity_thread_token,
      datum.base_lovelace == next_datum.base_lovelace,
      helpers.quantity(own_input.value, datum.liquidity_thread_token) == 1,
      helpers.quantity(continuing_output.value, datum.liquidity_thread_token) == 1,
      assets.quantity_of(
        self.mint,
        datum.liquidity_thread_token.policy_id,
        datum.liquidity_thread_token.asset_name,
      ) == 0,
      input_lovelace == datum.base_lovelace + datum.reserve_lovelace,
      output_lovelace == next_datum.base_lovelace + next_datum.reserve_lovelace,
      assets.without_lovelace(own_input.value) == assets.without_lovelace(
        continuing_output.value,
      ),
    }

    let transition_checks = when redeemer is {
      Deposit { receipt, amount } -> {
        expect [market_reference] = helpers.inputs_with_asset(
          self.reference_inputs,
          datum.market_thread_token,
        )
        expect InlineDatum(market_data) = market_reference.output.datum
        expect market: MarketDatum = market_data
        expect [receipt_output] = helpers.outputs_at_script(
          self.outputs,
          lp_receipt_script_hash,
        )
        expect InlineDatum(receipt_data) = receipt_output.datum
        expect output_receipt: LpReceiptDatum = receipt_data
        let receipt_asset = AssetClass {
          policy_id: lp_receipt_policy_id,
          asset_name: receipt.receipt_id,
        }
        let expected = LiquidityDatum {
          ..datum,
          reserve_lovelace: datum.reserve_lovelace + amount,
          total_lp_units: datum.total_lp_units + amount,
        }

        and {
          !datum.settled,
          market.status == PriceDiscovery,
          market.market_id == datum.market_id,
          market.market_thread_token == datum.market_thread_token,
          market.liquidity_thread_token == datum.liquidity_thread_token,
          amount > 0,
          receipt.units == amount,
          receipt_matches(receipt, datum, lp_receipt_policy_id),
          helpers.is_signed_by(self, receipt.owner_pkh),
          output_receipt == receipt,
          helpers.quantity(receipt_output.value, receipt_asset) == 1,
          assets.quantity_of(
            self.mint,
            lp_receipt_policy_id,
            receipt.receipt_id,
          ) == 1,
          next_datum == expected,
          output_lovelace == input_lovelace + amount,
        }
      }

      ApplyTrade { reserve_delta, fee } -> {
        expect [market_input] = helpers.inputs_with_asset(
          self.inputs,
          datum.market_thread_token,
        )
        expect [market_output] = helpers.outputs_with_asset(
          self.outputs,
          datum.market_thread_token,
        )
        expect InlineDatum(old_market_data) = market_input.output.datum
        expect old_market: MarketDatum = old_market_data
        expect InlineDatum(next_market_data) = market_output.datum
        expect next_market: MarketDatum = next_market_data
        let expected = LiquidityDatum {
          ..datum,
          reserve_lovelace: datum.reserve_lovelace + reserve_delta,
          fees_accrued: datum.fees_accrued + fee,
        }

        and {
          !datum.settled,
          fee > 0,
          old_market.status == Trading,
          next_market.status == Trading,
          old_market.market_id == datum.market_id,
          next_market.market_id == datum.market_id,
          old_market.market_liquidity == datum.reserve_lovelace,
          next_market.market_liquidity == expected.reserve_lovelace,
          market_output.address == market_input.output.address,
          next_datum == expected,
          output_lovelace == input_lovelace + reserve_delta,
        }
      }

      ApplyClaim { reserve_delta } -> {
        expect [market_input] = helpers.inputs_with_asset(
          self.inputs,
          datum.market_thread_token,
        )
        expect [market_output] = helpers.outputs_with_asset(
          self.outputs,
          datum.market_thread_token,
        )
        expect InlineDatum(old_market_data) = market_input.output.datum
        expect old_market: MarketDatum = old_market_data
        expect InlineDatum(next_market_data) = market_output.datum
        expect next_market: MarketDatum = next_market_data
        let expected = LiquidityDatum {
          ..datum,
          reserve_lovelace: datum.reserve_lovelace + reserve_delta,
        }
        let terminal_status = old_market.status == Resolved || old_market.status == Voided

        and {
          !datum.settled,
          reserve_delta <= 0,
          terminal_status,
          next_market.status == old_market.status,
          old_market.market_id == datum.market_id,
          next_market.market_id == datum.market_id,
          old_market.market_liquidity == datum.reserve_lovelace,
          next_market.market_liquidity == expected.reserve_lovelace,
          next_market.open_positions == old_market.open_positions - 1,
          market_output.address == market_input.output.address,
          next_datum == expected,
          output_lovelace == input_lovelace + reserve_delta,
        }
      }

      SettleLiquidity -> {
        expect [market_input] = helpers.inputs_with_asset(
          self.inputs,
          datum.market_thread_token,
        )
        expect [market_output] = helpers.outputs_with_asset(
          self.outputs,
          datum.market_thread_token,
        )
        expect InlineDatum(old_market_data) = market_input.output.datum
        expect old_market: MarketDatum = old_market_data
        expect InlineDatum(next_market_data) = market_output.datum
        expect next_market: MarketDatum = next_market_data
        let swept = old_market.user_collateral
        let expected = LiquidityDatum {
          ..datum,
          reserve_lovelace: datum.reserve_lovelace + swept,
          settled: True,
        }

        and {
          !datum.settled,
          old_market.status == Resolved || old_market.status == Voided,
          next_market.status == Settled,
          old_market.market_id == datum.market_id,
          next_market.market_id == datum.market_id,
          old_market.market_liquidity == datum.reserve_lovelace,
          next_market.market_liquidity == expected.reserve_lovelace,
          next_market.user_collateral == 0,
          market_output.address == market_input.output.address,
          next_datum == expected,
          output_lovelace == input_lovelace + swept,
        }
      }

      RedeemLp { receipt } -> {
        expect [receipt_input] = helpers.inputs_at_script(
          self.inputs,
          lp_receipt_script_hash,
        )
        expect InlineDatum(receipt_data) = receipt_input.output.datum
        expect input_receipt: LpReceiptDatum = receipt_data
        let receipt_asset = AssetClass {
          policy_id: lp_receipt_policy_id,
          asset_name: receipt.receipt_id,
        }
        let payout = helpers.pro_rata_share(
          datum.reserve_lovelace,
          receipt.units,
          datum.total_lp_units,
        )
        let expected = LiquidityDatum {
          ..datum,
          reserve_lovelace: datum.reserve_lovelace - payout,
          total_lp_units: datum.total_lp_units - receipt.units,
        }

        and {
          datum.settled,
          receipt_matches(receipt, datum, lp_receipt_policy_id),
          input_receipt == receipt,
          receipt.units <= datum.total_lp_units,
          helpers.is_signed_by(self, receipt.owner_pkh),
          helpers.quantity(receipt_input.output.value, receipt_asset) == 1,
          assets.quantity_of(
            self.mint,
            lp_receipt_policy_id,
            receipt.receipt_id,
          ) == -1,
          next_datum == expected,
          output_lovelace == input_lovelace - payout,
          helpers.paid_lovelace_to(self.outputs, receipt.owner_pkh) >= payout,
        }
      }
    }

    common_checks && transition_checks
  }

  else(_) {
    fail
  }
}
