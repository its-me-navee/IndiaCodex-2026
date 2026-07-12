use aiken/collection/list
use aiken/collection/pairs
use cardano/assets
use cardano/transaction.{OutputReference, Spend, Transaction}
use probx/helpers
use probx/types.{
  AssetClass, CashOut, MarketRedeemer, PositionDatum, PositionRedeemer, Redeem,
  SpendPosition,
}

validator position(trusted_market_thread: AssetClass) {
  spend(
    datum_opt: Option<PositionDatum>,
    redeemer: PositionRedeemer,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(datum) = datum_opt
    let SpendPosition = redeemer
    let own_input = transaction.resolve_input(self.inputs, own_ref)
    let position_asset = AssetClass {
      policy_id: datum.position_policy_id,
      asset_name: datum.position_id,
    }
    expect [market_input] = helpers.inputs_with_asset(
      self.inputs,
      trusted_market_thread,
    )
    expect Some(market_redeemer_data) = pairs.get_first(
      self.redeemers,
      Spend(market_input.output_reference),
    )
    expect market_redeemer: MarketRedeemer = market_redeemer_data
    let matching_transition = when market_redeemer is {
      CashOut { position } | Redeem { position } -> position == datum
      _ -> False
    }

    and {
      datum.market_thread_token == trusted_market_thread,
      helpers.is_signed_by(self, datum.owner_pkh),
      helpers.quantity(own_input.value, position_asset) == 1,
      assets.quantity_of(self.mint, datum.position_policy_id, datum.position_id) == -1,
      matching_transition,
      helpers.outputs_with_asset(self.outputs, position_asset) |> list.is_empty,
    }
  }

  else(_) {
    fail
  }
}
