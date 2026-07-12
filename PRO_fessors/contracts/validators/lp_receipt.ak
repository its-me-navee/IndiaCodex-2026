use aiken/collection/list
use aiken/collection/pairs
use cardano/assets
use cardano/transaction.{OutputReference, Spend, Transaction}
use probx/helpers
use probx/types.{
  AssetClass, LiquidityRedeemer, LpReceiptDatum, LpReceiptRedeemer, RedeemLp,
  SpendLpReceipt,
}

validator lp_receipt(trusted_liquidity_thread: AssetClass) {
  spend(
    datum_opt: Option<LpReceiptDatum>,
    redeemer: LpReceiptRedeemer,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(datum) = datum_opt
    let SpendLpReceipt = redeemer
    let own_input = transaction.resolve_input(self.inputs, own_ref)
    let receipt_asset = AssetClass {
      policy_id: datum.receipt_policy_id,
      asset_name: datum.receipt_id,
    }
    expect [liquidity_input] = helpers.inputs_with_asset(
      self.inputs,
      trusted_liquidity_thread,
    )
    expect Some(liquidity_redeemer_data) = pairs.get_first(
      self.redeemers,
      Spend(liquidity_input.output_reference),
    )
    expect liquidity_redeemer: LiquidityRedeemer = liquidity_redeemer_data
    let matching_transition = when liquidity_redeemer is {
      RedeemLp { receipt } -> receipt == datum
      _ -> False
    }

    and {
      datum.liquidity_thread_token == trusted_liquidity_thread,
      helpers.is_signed_by(self, datum.owner_pkh),
      helpers.quantity(own_input.value, receipt_asset) == 1,
      assets.quantity_of(self.mint, datum.receipt_policy_id, datum.receipt_id) == -1,
      matching_transition,
      helpers.outputs_with_asset(self.outputs, receipt_asset) |> list.is_empty,
    }
  }

  else(_) {
    fail
  }
}
