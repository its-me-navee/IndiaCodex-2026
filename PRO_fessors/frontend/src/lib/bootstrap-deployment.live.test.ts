// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  BlockfrostProvider,
  MeshTxBuilder,
  applyParamsToScript,
  assetClass,
  byteString,
  outputReference,
  resolvePaymentKeyHash,
  resolveScriptHash,
  resolveTxHash,
  serializePlutusScript,
  type Protocol,
  type UTxO,
} from "@meshsdk/core";
import { expect, test } from "vitest";

import {
  BOOTSTRAP_SIGNING_WITNESS_MARGIN_BYTES,
  assembleBootstrapUnsignedTransaction,
  buildDemoGenesisDatums,
  deriveBootstrapGraph,
  isPureAdaUtxo,
  lovelaceIn,
  utxoReference,
  type BootstrapScriptTools,
  type ContractBlueprint,
} from "@/lib/bootstrap-deployment";

interface DeploymentPlan {
  admin_payment_credential: string;
  seed: { tx_hash: string; output_index: number };
  state_policy: { policy_id: string };
  scripts: Record<
    "lifecycle" | "trading" | "settlement" | "liquidity" | "position",
    { address: string; hash: string }
  >;
}

const runLive = process.env.RUN_PREPROD_BOOTSTRAP_DRY_RUN === "1" ? test : test.skip;

/**
 * Opt-in, read-only preprod integration check. It queries public UTxOs, builds
 * and evaluates the exact bootstrap transaction, but never asks for a wallet
 * signature and never submits CBOR.
 */
runLive("builds and evaluates the reviewed preprod bootstrap without submitting", async () => {
  const projectId = process.env.BLOCKFROST_PROJECT_ID ?? "";
  expect(projectId, "BLOCKFROST_PROJECT_ID is required").toMatch(/^preprod/);

  const plan = JSON.parse(
    readFileSync(resolve(process.cwd(), "../deployments/preprod-plan.json"), "utf8"),
  ) as DeploymentPlan;
  const blueprint = JSON.parse(
    readFileSync(resolve(process.cwd(), "../contracts/plutus.json"), "utf8"),
  ) as ContractBlueprint;
  const provider = new BlockfrostProvider(projectId);

  const historicalSeed = await provider.fetchUTxOs(
    plan.seed.tx_hash,
    plan.seed.output_index,
  );
  expect(historicalSeed).toHaveLength(1);
  const address = historicalSeed[0]!.output.address;
  const active = await provider.fetchAddressUTxOs(address);
  const seedReference = `${plan.seed.tx_hash}#${plan.seed.output_index}`;
  const seed = active.find((utxo) => utxoReference(utxo) === seedReference);
  expect(seed, `reviewed seed ${seedReference} must still be unspent`).toBeDefined();

  const collateral = active
    .filter((utxo) => utxoReference(utxo) !== seedReference)
    .filter((utxo) => isPureAdaUtxo(utxo) && lovelaceIn(utxo) >= 5_000_000n)
    .sort((left, right) => Number(lovelaceIn(left) - lovelaceIn(right)))[0];
  expect(collateral, "a separate pure-ADA collateral UTxO is required").toBeDefined();

  const graph = deriveBootstrapGraph(
    blueprint,
    { txHash: plan.seed.tx_hash, outputIndex: plan.seed.output_index },
    plan.admin_payment_credential,
    {
      applyParamsToScript,
      assetClass,
      byteString,
      outputReference,
      resolveScriptHash,
      serializePlutusScript,
    } as BootstrapScriptTools,
  );
  expect(graph.statePolicy.policyId).toBe(plan.state_policy.policy_id);
  for (const key of [
    "lifecycle",
    "trading",
    "settlement",
    "liquidity",
    "position",
  ] as const) {
    expect(graph.scripts[key].address).toBe(plan.scripts[key].address);
    expect(graph.scripts[key].hash).toBe(plan.scripts[key].hash);
  }

  const [protocolParameters, latestBlock]: [Protocol, { slot: string }] = await Promise.all([
    provider.fetchProtocolParameters(),
    provider.fetchLatestBlock(),
  ]);
  const builder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    params: protocolParameters,
  });
  const datums = buildDemoGenesisDatums(
    plan.admin_payment_credential,
    graph.statePolicy.policyId,
  );
  const unsignedTx = await assembleBootstrapUnsignedTransaction(builder, {
    selection: { seed: seed as UTxO, collateral: collateral as UTxO },
    changeAddress: address,
    adminPaymentCredential: plan.admin_payment_credential,
    graph,
    ...datums,
    invalidHereafterSlot: Number(latestBlock.slot) + 600,
  });
  const unsignedBytes = unsignedTx.length / 2;

  expect(unsignedBytes + BOOTSTRAP_SIGNING_WITNESS_MARGIN_BYTES).toBeLessThanOrEqual(
    protocolParameters.maxTxSize,
  );
  expect(resolveTxHash(unsignedTx)).toMatch(/^[0-9a-f]{64}$/);
  expect(resolvePaymentKeyHash(address)).toBe(plan.admin_payment_credential);
}, 30_000);
