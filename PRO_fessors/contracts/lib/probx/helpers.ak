use aiken/collection/list
use aiken/crypto.{ScriptHash, VerificationKeyHash}
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets
use cardano/transaction.{Input, Output, Transaction}
use probx/curve
use probx/types.{
  AssetClass, MarketDatum, PendingActivation, PriceDiscovery, Resolved,
  ResolvedNo, ResolvedVoid, ResolvedYes, Settled, Trading, Voided,
}

pub fn is_signed_by(self: Transaction, signer: VerificationKeyHash) -> Bool {
  list.has(self.extra_signatories, signer)
}

pub fn has_resolver_quorum(self: Transaction, datum: MarketDatum) -> Bool {
  signed_key_quorum(
    self.extra_signatories,
    datum.resolver_key_hashes,
    datum.resolver_threshold,
  )
}

pub fn signed_key_quorum(
  signers: List<VerificationKeyHash>,
  keys: List<VerificationKeyHash>,
  threshold: Int,
) -> Bool {
  list.count(keys, fn(key) { list.has(signers, key) }) >= threshold
}

pub fn quantity(value: assets.Value, asset: AssetClass) -> Int {
  assets.quantity_of(value, asset.policy_id, asset.asset_name)
}

pub fn inputs_with_asset(inputs: List<Input>, asset: AssetClass) -> List<Input> {
  inputs |> list.filter(fn(input) { quantity(input.output.value, asset) == 1 })
}

pub fn outputs_with_asset(
  outputs: List<Output>,
  asset: AssetClass,
) -> List<Output> {
  outputs |> list.filter(fn(output) { quantity(output.value, asset) == 1 })
}

pub fn inputs_at(inputs: List<Input>, address: Address) -> List<Input> {
  inputs |> list.filter(fn(input) { input.output.address == address })
}

pub fn outputs_at(outputs: List<Output>, address: Address) -> List<Output> {
  outputs |> list.filter(fn(output) { output.address == address })
}

pub fn inputs_at_script(
  inputs: List<Input>,
  script_hash: ScriptHash,
) -> List<Input> {
  inputs
    |> list.filter(
        fn(input) {
          input.output.address.payment_credential == Script(script_hash)
        },
      )
}

pub fn outputs_at_script(
  outputs: List<Output>,
  script_hash: ScriptHash,
) -> List<Output> {
  outputs
    |> list.filter(
        fn(output) { output.address.payment_credential == Script(script_hash) },
      )
}

pub fn paid_lovelace_to(
  outputs: List<Output>,
  recipient: VerificationKeyHash,
) -> Int {
  outputs
    |> list.foldl(
        0,
        fn(output, total) {
          when output.address.payment_credential is {
            VerificationKey(pkh) ->
              if pkh == recipient {
                total + assets.lovelace_of(output.value)
              } else {
                total
              }
            _ -> total
          }
        },
      )
}

/// MVP resolution is controlled by the configured admin wallet. Keep the
/// resolver list/threshold datum fields for forward compatibility, but reject
/// any market that does not encode exactly that one key.
pub fn single_admin_resolver(
  keys: List<VerificationKeyHash>,
  admin_pkh: VerificationKeyHash,
) -> Bool {
  keys == [admin_pkh]
}

pub fn well_formed_market(datum: MarketDatum) -> Bool {
  let status_shape = when datum.status is {
    PendingActivation | PriceDiscovery -> datum.resolution_outcome == None
    Trading -> and {
        datum.resolution_outcome == None,
        datum.opening_yes_count + datum.opening_no_count == 100,
        datum.opening_tick >= curve.min_tick,
        datum.opening_tick <= curve.max_tick,
        datum.probability_tick == curve.current_tick(
          datum.opening_tick,
          datum.yes_quantity,
          datum.no_quantity,
        ),
      }
    Resolved ->
      when datum.resolution_outcome is {
        Some(ResolvedYes) | Some(ResolvedNo) -> True
        _ -> False
      }
    Voided -> datum.resolution_outcome == Some(ResolvedVoid)
    Settled -> datum.resolution_outcome != None
  }
  let collateral = datum.user_collateral + datum.market_liquidity

  and {
    single_admin_resolver(datum.resolver_key_hashes, datum.admin_pkh),
    datum.resolver_threshold == 1,
    datum.trading_deadline_ms > 0,
    datum.resolution_deadline_ms > datum.trading_deadline_ms,
    datum.claim_deadline_ms > datum.resolution_deadline_ms,
    curve.valid_config(datum.curve_config),
    datum.liquidity_fee_bps == 100,
    datum.state_base_lovelace > 0,
    datum.opening_yes_count >= 0,
    datum.opening_no_count >= 0,
    datum.yes_quantity >= 0,
    datum.no_quantity >= 0,
    datum.user_collateral >= 0,
    datum.market_liquidity >= 0,
    datum.yes_liability >= 0,
    datum.no_liability >= 0,
    datum.open_positions >= 0,
    datum.yes_liability <= collateral,
    datum.no_liability <= collateral,
    status_shape,
  }
}

pub fn immutable_terms_unchanged(old: MarketDatum, next: MarketDatum) -> Bool {
  and {
    old.market_id == next.market_id,
    old.terms_hash == next.terms_hash,
    old.metadata_hash == next.metadata_hash,
    old.creator_pkh == next.creator_pkh,
    old.admin_pkh == next.admin_pkh,
    old.resolver_key_hashes == next.resolver_key_hashes,
    old.resolver_threshold == next.resolver_threshold,
    old.trading_deadline_ms == next.trading_deadline_ms,
    old.resolution_deadline_ms == next.resolution_deadline_ms,
    old.claim_deadline_ms == next.claim_deadline_ms,
    old.resolution_criteria_hash == next.resolution_criteria_hash,
    old.curve_config == next.curve_config,
    old.liquidity_fee_bps == next.liquidity_fee_bps,
    old.state_base_lovelace == next.state_base_lovelace,
    old.market_thread_token == next.market_thread_token,
    old.liquidity_thread_token == next.liquidity_thread_token,
  }
}

pub fn min(a: Int, b: Int) -> Int {
  if a < b {
    a
  } else {
    b
  }
}

pub fn pro_rata_share(reserve: Int, units: Int, total_units: Int) -> Int {
  if units == total_units {
    reserve
  } else {
    reserve * units / total_units
  }
}
