import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  applyParamsToScript,
  assetClass,
  byteString,
  outputReference,
  resolveScriptHash,
  serializePlutusScript,
} from "@meshsdk/core";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);

const [seedTxHash, seedIndexText] = (args.seed ?? "").split("#");
const seedOutputIndex = Number(seedIndexText);
const adminPaymentCredential = (args.admin ?? "").toLowerCase();
const seedLovelace = args["seed-lovelace"] ?? "unknown";
const blueprintPath = resolve(process.cwd(), args.blueprint ?? "../contracts/plutus.json");
const outputPath = args.output ? resolve(process.cwd(), args.output) : null;

if (!/^[0-9a-f]{64}$/.test(seedTxHash ?? "") || !Number.isInteger(seedOutputIndex) || seedOutputIndex < 0) {
  throw new Error("Pass an unspent seed as --seed=<64-char-tx-hash>#<output-index>.");
}
if (!/^[0-9a-f]{56}$/.test(adminPaymentCredential)) {
  throw new Error("Pass the 56-character admin payment credential as --admin=<hex>.");
}

const blueprintSource = readFileSync(blueprintPath, "utf8");
const blueprint = JSON.parse(blueprintSource);
const validator = (title) => {
  const match = blueprint.validators.find((candidate) => candidate.title === title);
  if (!match) throw new Error(`Validator ${title} is missing from ${blueprintPath}.`);
  return match.compiledCode;
};
const apply = (title, parameters) =>
  applyParamsToScript(validator(title), parameters, "JSON");
const hash = (script) => resolveScriptHash(script, "V3");
const address = (script) =>
  serializePlutusScript({ code: script, version: "V3" }, undefined, 0).address;
const scriptEntry = (script) => ({
  hash: hash(script),
  address: address(script),
  applied_bytes: script.length / 2,
});

const marketAssetName = "4d41524b45545f5354415445";
const liquidityAssetName = "4c49515549444954595f5354415445";
const demoGenesis = {
  market_id: "probx-demo-001",
  statement: "Will ADA/USD be at or above $1.00 at 00:00 UTC on 31 December 2026?",
  trading_deadline_ms: 1_798_675_200_000,
  resolution_deadline_ms: 1_798_848_000_000,
  claim_deadline_ms: 1_801_440_000_000,
  terms_sha256: "a3e156864be351ba16dfc1de867938121ff868e4f5cf560e1d8fead7bd380a79",
  metadata_sha256: "e2f39251b7f24c111cb3c5d9247f6b7b6bd471fae031fd3c6fdd4b47a7d7d0c4",
  resolution_criteria_sha256:
    "949833ee0e8e0a27b9adb2e4b78b0797d7ad002d55aa65b16701089e548d126a",
  resolution_source: "Coinbase ADA-USD one-minute candle at 2026-12-31T00:00:00Z",
  purpose: "disposable_hackathon_demo",
};
const stateToken = apply("state_token.state_token.mint", [
  outputReference(seedTxHash, seedOutputIndex),
  byteString(adminPaymentCredential),
]);
const statePolicyId = hash(stateToken);
const marketThread = assetClass(statePolicyId, marketAssetName);
const liquidityThread = assetClass(statePolicyId, liquidityAssetName);

const position = apply("position.position.spend", [marketThread]);
const positionHash = hash(position);
const positionToken = apply("position_token.position_token.mint", [
  marketThread,
  byteString(positionHash),
]);
const positionPolicyId = hash(positionToken);

const lpReceipt = apply("lp_receipt.lp_receipt.spend", [liquidityThread]);
const lpReceiptHash = hash(lpReceipt);
const lpReceiptToken = apply("lp_receipt_token.lp_receipt_token.mint", [
  liquidityThread,
  byteString(lpReceiptHash),
]);
const lpReceiptPolicyId = hash(lpReceiptToken);

const settlement = apply("market_settlement.market_settlement.spend", [
  byteString(positionHash),
  byteString(positionPolicyId),
]);
const trading = apply("market.market.spend", [
  byteString(positionPolicyId),
  byteString(hash(settlement)),
]);
const lifecycle = apply("market_lifecycle.market_lifecycle.spend", [
  byteString(hash(trading)),
]);
const liquidity = apply("liquidity.liquidity.spend", [
  byteString(lpReceiptHash),
  byteString(lpReceiptPolicyId),
]);

const manifest = {
  network: "preprod",
  status: "PLANNED_NOT_SUBMITTED",
  blueprint_sha256: createHash("sha256").update(blueprintSource).digest("hex"),
  admin_payment_credential: adminPaymentCredential,
  seed: {
    tx_hash: seedTxHash,
    output_index: seedOutputIndex,
    lovelace: seedLovelace,
  },
  genesis: demoGenesis,
  state_policy: {
    policy_id: statePolicyId,
    applied_bytes: stateToken.length / 2,
  },
  assets: {
    market: {
      name_hex: marketAssetName,
      unit: `${statePolicyId}${marketAssetName}`,
    },
    liquidity: {
      name_hex: liquidityAssetName,
      unit: `${statePolicyId}${liquidityAssetName}`,
    },
  },
  scripts: {
    lifecycle: scriptEntry(lifecycle),
    trading: scriptEntry(trading),
    settlement: scriptEntry(settlement),
    liquidity: scriptEntry(liquidity),
    position: scriptEntry(position),
    position_token: {
      policy_id: positionPolicyId,
      applied_bytes: positionToken.length / 2,
    },
    lp_receipt: scriptEntry(lpReceipt),
    lp_receipt_token: {
      policy_id: lpReceiptPolicyId,
      applied_bytes: lpReceiptToken.length / 2,
    },
  },
};

const oversized = Object.entries(manifest.scripts)
  .filter(([, entry]) => "applied_bytes" in entry && entry.applied_bytes > 14_384)
  .map(([name]) => name);
if (manifest.state_policy.applied_bytes > 14_384 || oversized.length > 0) {
  throw new Error(`Applied validator exceeds the deployment budget: ${oversized.join(", ") || "state_policy"}.`);
}

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
if (outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized);
  console.log(outputPath);
} else {
  process.stdout.write(serialized);
}
