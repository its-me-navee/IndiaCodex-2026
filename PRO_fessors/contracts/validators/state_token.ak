use aiken/crypto.{VerificationKeyHash}
use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use probx/bootstrap
use probx/types.{Bootstrap, BootstrapRedeemer}

/// Per-market one-shot policy. Applying it to a key-controlled seed UTxO and
/// the admin payment key yields the shared policy id for both state NFTs.
validator state_token(
  seed_ref: OutputReference,
  admin_pkh: VerificationKeyHash,
) {
  mint(redeemer: BootstrapRedeemer, own_policy_id: PolicyId, self: Transaction) {
    let Bootstrap { market_script_hash, liquidity_script_hash } = redeemer
    bootstrap.validate(
      seed_ref,
      admin_pkh,
      market_script_hash,
      liquidity_script_hash,
      own_policy_id,
      self,
    )
  }

  else(_) {
    fail
  }
}
