import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const blueprintPath = resolve(process.cwd(), "contracts/plutus.json");
const blueprintSource = readFileSync(blueprintPath, "utf8");
const blueprint = JSON.parse(blueprintSource);
const maxTransactionBytes = Number(process.env.CARDANO_MAX_TX_SIZE ?? 16_384);
const transactionEnvelopeBytes = Number(process.env.PROBX_TX_ENVELOPE_BYTES ?? 2_000);
const rawScriptBudget = maxTransactionBytes - transactionEnvelopeBytes;

if (!Array.isArray(blueprint.validators)) {
  throw new Error(`No validators found in ${blueprintPath}`);
}

if (rawScriptBudget <= 0) {
  throw new Error("The configured transaction envelope leaves no room for a validator.");
}

const uniqueValidators = new Map();
for (const validator of blueprint.validators) {
  const key = validator.hash ?? validator.compiledCode;
  const existing = uniqueValidators.get(key);
  if (!existing || validator.title.endsWith(".spend") || validator.title.endsWith(".mint")) {
    uniqueValidators.set(key, validator);
  }
}

const rows = [...uniqueValidators.values()]
  .map((validator) => ({
    title: validator.title,
    bytes: Buffer.from(validator.compiledCode, "hex").byteLength,
  }))
  .sort((left, right) => right.bytes - left.bytes);

console.log(
  `Preprod transaction limit: ${maxTransactionBytes} bytes; conservative raw-script budget: ${rawScriptBudget} bytes`,
);
for (const row of rows) {
  const status = row.bytes <= rawScriptBudget ? "PASS" : "FAIL";
  console.log(`${status.padEnd(4)} ${String(row.bytes).padStart(6)}  ${row.title}`);
}

const oversized = rows.filter((row) => row.bytes > rawScriptBudget);
if (oversized.length > 0) {
  console.error(
    "Deployment blocked: parameter application, witnesses, outputs, fees, and metadata must also fit inside the transaction.",
  );
  process.exitCode = 1;
}

const deploymentPlanPath = resolve(process.cwd(), "deployments/preprod-plan.json");
if (existsSync(deploymentPlanPath)) {
  const deploymentPlan = JSON.parse(readFileSync(deploymentPlanPath, "utf8"));
  const blueprintHash = createHash("sha256").update(blueprintSource).digest("hex");
  if (deploymentPlan.blueprint_sha256 !== blueprintHash) {
    console.error(
      "Deployment blocked: deployments/preprod-plan.json was derived from a different blueprint.",
    );
    process.exitCode = 1;
  } else {
    console.log(`PASS blueprint ${blueprintHash.slice(0, 12)}… matches preprod plan`);
  }
}
