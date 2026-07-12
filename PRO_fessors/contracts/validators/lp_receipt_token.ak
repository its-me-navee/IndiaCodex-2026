use aiken/collection/dict
use aiken/collection/list
use aiken/collection/pairs
use aiken/crypto.{ScriptHash}
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Spend, Transaction}
use probx/helpers
use probx/types.{
  AssetClass, BurnLpReceipt, Deposit, IssueLpReceipt, LiquidityRedeemer,
  LpReceiptDatum, LpReceiptTokenRedeemer, RedeemLp,
}

validator lp_receipt_token(
  trusted_liquidity_thread: AssetClass,
  lp_receipt_script_hash: ScriptHash,
) {
  mint(
    redeemer: LpReceiptTokenRedeemer,
    own_policy_id: PolicyId,
    self: Transaction,
  ) {
    expect [liquidity_input] = helpers.inputs_with_asset(
      self.inputs,
      trusted_liquidity_thread,
    )
    expect Some(liquidity_redeemer_data) = pairs.get_first(
      self.redeemers,
      Spend(liquidity_input.output_reference),
    )
    expect liquidity_redeemer: LiquidityRedeemer = liquidity_redeemer_data
    let own_token_count = assets.tokens(self.mint, own_policy_id)
      |> dict.to_pairs
      |> list.length

    let transition_checks = when redeemer is {
      IssueLpReceipt { receipt } -> {
        expect [receipt_output] = helpers.outputs_at_script(
          self.outputs,
          lp_receipt_script_hash,
        )
        expect InlineDatum(receipt_data) = receipt_output.datum
        expect output_receipt: LpReceiptDatum = receipt_data
        and {
          receipt.liquidity_thread_token == trusted_liquidity_thread,
          receipt.receipt_policy_id == own_policy_id,
          liquidity_redeemer == Deposit { receipt, amount: receipt.units },
          output_receipt == receipt,
          assets.quantity_of(self.mint, own_policy_id, receipt.receipt_id) == 1,
          assets.quantity_of(
            receipt_output.value,
            own_policy_id,
            receipt.receipt_id,
          ) == 1,
        }
      }
      BurnLpReceipt { receipt } -> {
        expect [receipt_input] = helpers.inputs_at_script(
          self.inputs,
          lp_receipt_script_hash,
        )
        expect InlineDatum(receipt_data) = receipt_input.output.datum
        expect input_receipt: LpReceiptDatum = receipt_data
        and {
          receipt.liquidity_thread_token == trusted_liquidity_thread,
          receipt.receipt_policy_id == own_policy_id,
          liquidity_redeemer == RedeemLp { receipt },
          input_receipt == receipt,
          assets.quantity_of(self.mint, own_policy_id, receipt.receipt_id) == -1,
          assets.quantity_of(
            receipt_input.output.value,
            own_policy_id,
            receipt.receipt_id,
          ) == 1,
        }
      }
    }

    own_token_count == 1 && transition_checks
  }

  else(_) {
    fail
  }
}
