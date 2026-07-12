use aiken/collection/dict
use aiken/collection/list
use aiken/collection/pairs
use aiken/crypto.{ScriptHash}
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Spend, Transaction}
use probx/helpers
use probx/types.{
  AssetClass, BurnPosition, BuyPosition, CashOut, IssuePosition, MarketRedeemer,
  PositionDatum, PositionTokenRedeemer, Redeem,
}

validator position_token(
  trusted_market_thread: AssetClass,
  position_script_hash: ScriptHash,
) {
  mint(
    redeemer: PositionTokenRedeemer,
    own_policy_id: PolicyId,
    self: Transaction,
  ) {
    expect [market_input] = helpers.inputs_with_asset(
      self.inputs,
      trusted_market_thread,
    )
    expect Some(market_redeemer_data) = pairs.get_first(
      self.redeemers,
      Spend(market_input.output_reference),
    )
    expect market_redeemer: MarketRedeemer = market_redeemer_data
    let own_token_count = assets.tokens(self.mint, own_policy_id)
      |> dict.to_pairs
      |> list.length

    let transition_checks = when redeemer is {
      IssuePosition { position } -> {
        expect [position_output] = helpers.outputs_at_script(
          self.outputs,
          position_script_hash,
        )
        expect InlineDatum(position_data) = position_output.datum
        expect output_position: PositionDatum = position_data
        and {
          position.market_thread_token == trusted_market_thread,
          position.position_policy_id == own_policy_id,
          market_redeemer == BuyPosition { position },
          output_position == position,
          assets.quantity_of(self.mint, own_policy_id, position.position_id) == 1,
          assets.quantity_of(
            position_output.value,
            own_policy_id,
            position.position_id,
          ) == 1,
        }
      }
      BurnPosition { position } -> {
        expect [position_input] = helpers.inputs_at_script(
          self.inputs,
          position_script_hash,
        )
        expect InlineDatum(position_data) = position_input.output.datum
        expect input_position: PositionDatum = position_data
        let matching_market_transition = when market_redeemer is {
          CashOut { position: market_position } |
          Redeem { position: market_position } -> market_position == position
          _ -> False
        }
        and {
          position.market_thread_token == trusted_market_thread,
          position.position_policy_id == own_policy_id,
          input_position == position,
          matching_market_transition,
          assets.quantity_of(self.mint, own_policy_id, position.position_id) == -1,
          assets.quantity_of(
            position_input.output.value,
            own_policy_id,
            position.position_id,
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
