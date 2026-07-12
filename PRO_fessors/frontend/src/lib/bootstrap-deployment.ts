import type { Asset, Protocol, UTxO } from "@meshsdk/core";

import { CONFIG } from "@/lib/config";
import { connectedWalletApi } from "@/lib/wallet";

export const MARKET_STATE_NAME = "4d41524b45545f5354415445";
export const LIQUIDITY_STATE_NAME = "4c49515549444954595f5354415445";
export const BOOTSTRAP_STATE_LOVELACE = "3000000";
export const BOOTSTRAP_MIN_SEED_LOVELACE = 16_000_000n;
export const BOOTSTRAP_SIGNING_WITNESS_MARGIN_BYTES = 512;
export const BOOTSTRAP_TOTAL_COLLATERAL_LOVELACE = "2000000";
export const BOOTSTRAP_TTL_SLOTS = 600;

/**
 * Immutable terms for the first disposable preprod market. The three hashes
 * are SHA-256 commitments to the canonical UTF-8 strings below; they replace
 * opaque placeholder bytes and make the exact demo terms reviewable.
 */
export const BOOTSTRAP_DEMO_MARKET = {
  marketId: "probx-demo-001",
  marketIdHex: "70726f62782d64656d6f2d303031",
  statement:
    "Will ADA/USD be at or above $1.00 at 00:00 UTC on 31 December 2026?",
  tradingDeadlineMs: 1_798_675_200_000,
  resolutionDeadlineMs: 1_798_848_000_000,
  claimDeadlineMs: 1_801_440_000_000,
  source: "Coinbase ADA-USD one-minute candle at 2026-12-31T00:00:00Z",
  canonicalTerms:
    '{"market_id":"probx-demo-001","statement":"Will ADA/USD be at or above $1.00 at 00:00 UTC on 31 December 2026?","trading_deadline_ms":1798675200000,"resolution_deadline_ms":1798848000000,"claim_deadline_ms":1801440000000}',
  canonicalMetadata:
    '{"category":"Crypto","network":"Cardano preprod","version":1}',
  canonicalResolutionCriteria:
    '{"outcome_yes":"Coinbase ADA-USD one-minute candle at 2026-12-31T00:00:00Z has close >= 1.0000 USD","outcome_no":"Coinbase ADA-USD one-minute candle at 2026-12-31T00:00:00Z has close < 1.0000 USD","void":"Source data is unavailable or materially disputed for 48 hours after the resolution time","resolver":"single disclosed admin wallet"}',
  termsHash: "a3e156864be351ba16dfc1de867938121ff868e4f5cf560e1d8fead7bd380a79",
  metadataHash: "e2f39251b7f24c111cb3c5d9247f6b7b6bd471fae031fd3c6fdd4b47a7d7d0c4",
  resolutionCriteriaHash:
    "949833ee0e8e0a27b9adb2e4b78b0797d7ad002d55aa65b16701089e548d126a",
} as const;

export type BootstrapAddressKey =
  | "lifecycle"
  | "trading"
  | "settlement"
  | "liquidity"
  | "position";

export type BootstrapErrorCode =
  | "CONFIG_REQUIRED"
  | "CONFIG_MISMATCH"
  | "WRONG_NETWORK"
  | "WRONG_WALLET"
  | "SEED_NOT_FOUND"
  | "SEED_SPENT"
  | "COLLATERAL_REQUIRED"
  | "COLLATERAL_SPENT"
  | "REVIEW_MISMATCH"
  | "REVIEW_EXPIRED"
  | "BLUEPRINT_INVALID"
  | "BLOCKFROST_UNAVAILABLE"
  | "BUILD_FAILED"
  | "SIGNING_FAILED";

export class BootstrapPreparationError extends Error {
  constructor(
    readonly code: BootstrapErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BootstrapPreparationError";
  }
}

export interface BlueprintValidator {
  title: string;
  compiledCode: string;
}

export interface ContractBlueprint {
  preamble?: { plutusVersion?: string };
  validators: BlueprintValidator[];
}

export interface BootstrapScriptTools {
  applyParamsToScript(rawScript: string, params: object[], type: "JSON"): string;
  resolveScriptHash(scriptCode: string, version: "V3"): string;
  serializePlutusScript(
    script: { code: string; version: "V3" },
    stakeCredentialHash: undefined,
    networkId: number,
  ): { address: string };
  assetClass(policyId: string, assetName: string): object;
  byteString(value: string): object;
  outputReference(txHash: string, outputIndex: number): object;
}

export interface AppliedBootstrapScript {
  code: string;
  hash: string;
  address: string;
  appliedBytes: number;
}

export interface BootstrapGraph {
  statePolicy: {
    code: string;
    policyId: string;
    appliedBytes: number;
  };
  scripts: Record<BootstrapAddressKey, AppliedBootstrapScript>;
  support: {
    positionPolicyId: string;
    lpReceiptScriptHash: string;
    lpReceiptPolicyId: string;
  };
  assets: {
    market: { name: string; unit: string };
    liquidity: { name: string; unit: string };
  };
}

export interface BootstrapConfiguration {
  network: string;
  blockfrostProjectId: string;
  adminPaymentCredential: string;
  addresses: Record<BootstrapAddressKey, string>;
  minimumCollateralLovelace: number;
}

export interface BootstrapInputSelection {
  seed: UTxO;
  collateral: UTxO;
}

export interface BootstrapPreparedReview {
  status: "PREPARED_UNSIGNED";
  unsignedTx: string;
  unsignedTxHash: string;
  unsignedTxBytes: number;
  invalidHereafterSlot: number;
  seed: UTxO;
  collateral: UTxO;
  changeAddress: string;
  graph: BootstrapGraph;
  marketDatum: object;
  liquidityDatum: object;
  outputs: Array<{
    role: "market" | "liquidity";
    address: string;
    lovelace: string;
    assetUnit: string;
  }>;
}

export interface BootstrapTxBuilder {
  setNetwork(network: "preprod"): BootstrapTxBuilder;
  txIn(
    txHash: string,
    outputIndex: number,
    amount: Asset[],
    address: string,
    scriptSize: number,
  ): BootstrapTxBuilder;
  inputForEvaluation(utxo: UTxO): BootstrapTxBuilder;
  txInCollateral(
    txHash: string,
    outputIndex: number,
    amount: Asset[],
    address: string,
  ): BootstrapTxBuilder;
  setTotalCollateral(lovelace: string): BootstrapTxBuilder;
  setCollateralReturnAddress(address: string): BootstrapTxBuilder;
  invalidHereafter(slot: number): BootstrapTxBuilder;
  txOut(address: string, amount: Asset[]): BootstrapTxBuilder;
  txOutInlineDatumValue(datum: object, type: "JSON"): BootstrapTxBuilder;
  mintPlutusScriptV3(): BootstrapTxBuilder;
  mint(quantity: string, policyId: string, assetName: string): BootstrapTxBuilder;
  mintingScript(scriptCode: string): BootstrapTxBuilder;
  mintRedeemerValue(redeemer: object, type: "JSON"): BootstrapTxBuilder;
  requiredSignerHash(paymentCredential: string): BootstrapTxBuilder;
  changeAddress(address: string): BootstrapTxBuilder;
  complete(): Promise<string>;
}

const addressKeys: BootstrapAddressKey[] = [
  "lifecycle",
  "trading",
  "settlement",
  "liquidity",
  "position",
];

function validatorCode(blueprint: ContractBlueprint, title: string): string {
  const validator = blueprint.validators.find((candidate) => candidate.title === title);
  if (!validator?.compiledCode) {
    throw new BootstrapPreparationError(
      "BLUEPRINT_INVALID",
      `The bundled contract blueprint is missing ${title}.`,
    );
  }
  return validator.compiledCode;
}

export function deriveBootstrapGraph(
  blueprint: ContractBlueprint,
  seed: { txHash: string; outputIndex: number },
  adminPaymentCredential: string,
  tools: BootstrapScriptTools,
): BootstrapGraph {
  if (blueprint.preamble?.plutusVersion && blueprint.preamble.plutusVersion !== "v3") {
    throw new BootstrapPreparationError(
      "BLUEPRINT_INVALID",
      `Expected a Plutus V3 blueprint, received ${blueprint.preamble.plutusVersion}.`,
    );
  }
  const apply = (title: string, parameters: object[]) =>
    tools.applyParamsToScript(validatorCode(blueprint, title), parameters, "JSON");
  const hash = (code: string) => tools.resolveScriptHash(code, "V3");
  const appliedScript = (code: string): AppliedBootstrapScript => ({
    code,
    hash: hash(code),
    address: tools.serializePlutusScript({ code, version: "V3" }, undefined, 0).address,
    appliedBytes: code.length / 2,
  });

  const statePolicyCode = apply("state_token.state_token.mint", [
    tools.outputReference(seed.txHash, seed.outputIndex),
    tools.byteString(adminPaymentCredential),
  ]);
  const statePolicyId = hash(statePolicyCode);
  const marketThread = tools.assetClass(statePolicyId, MARKET_STATE_NAME);
  const liquidityThread = tools.assetClass(statePolicyId, LIQUIDITY_STATE_NAME);

  const position = appliedScript(apply("position.position.spend", [marketThread]));
  const lpReceipt = appliedScript(
    apply("lp_receipt.lp_receipt.spend", [liquidityThread]),
  );
  const positionPolicyCode = apply("position_token.position_token.mint", [
    marketThread,
    tools.byteString(position.hash),
  ]);
  const positionPolicyId = hash(positionPolicyCode);
  const lpReceiptPolicyCode = apply("lp_receipt_token.lp_receipt_token.mint", [
    liquidityThread,
    tools.byteString(lpReceipt.hash),
  ]);
  const lpReceiptPolicyId = hash(lpReceiptPolicyCode);

  const settlement = appliedScript(
    apply("market_settlement.market_settlement.spend", [
      tools.byteString(position.hash),
      tools.byteString(positionPolicyId),
    ]),
  );
  const trading = appliedScript(
    apply("market.market.spend", [
      tools.byteString(positionPolicyId),
      tools.byteString(settlement.hash),
    ]),
  );
  const lifecycle = appliedScript(
    apply("market_lifecycle.market_lifecycle.spend", [tools.byteString(trading.hash)]),
  );
  const liquidity = appliedScript(
    apply("liquidity.liquidity.spend", [
      tools.byteString(lpReceipt.hash),
      tools.byteString(lpReceiptPolicyId),
    ]),
  );

  return {
    statePolicy: {
      code: statePolicyCode,
      policyId: statePolicyId,
      appliedBytes: statePolicyCode.length / 2,
    },
    scripts: { lifecycle, trading, settlement, liquidity, position },
    support: {
      positionPolicyId,
      lpReceiptScriptHash: lpReceipt.hash,
      lpReceiptPolicyId,
    },
    assets: {
      market: { name: MARKET_STATE_NAME, unit: `${statePolicyId}${MARKET_STATE_NAME}` },
      liquidity: {
        name: LIQUIDITY_STATE_NAME,
        unit: `${statePolicyId}${LIQUIDITY_STATE_NAME}`,
      },
    },
  };
}

export function getBootstrapConfiguration(): BootstrapConfiguration {
  return {
    network: CONFIG.network,
    blockfrostProjectId: CONFIG.blockfrostProjectId,
    adminPaymentCredential: CONFIG.adminPaymentCredential,
    addresses: {
      lifecycle: CONFIG.marketLifecycleScriptAddress,
      trading: CONFIG.marketScriptAddress,
      settlement: CONFIG.marketSettlementScriptAddress,
      liquidity: CONFIG.liquidityScriptAddress,
      position: CONFIG.positionScriptAddress,
    },
    minimumCollateralLovelace: CONFIG.deploymentMinCollateralLovelace,
  };
}

export function bootstrapConfigurationIssues(
  configuration: BootstrapConfiguration = getBootstrapConfiguration(),
): string[] {
  const issues: string[] = [];
  if (configuration.network.toLowerCase() !== "preprod") {
    issues.push("VITE_NETWORK must be preprod.");
  }
  if (
    !configuration.blockfrostProjectId.startsWith("preprod") ||
    /replace|example/i.test(configuration.blockfrostProjectId)
  ) {
    issues.push("A real preprod VITE_BLOCKFROST_PROJECT_ID is required for evaluation.");
  }
  if (!/^[0-9a-f]{56}$/.test(configuration.adminPaymentCredential)) {
    issues.push("VITE_ADMIN_PAYMENT_CREDENTIAL must be a 56-character lowercase key hash.");
  }
  for (const key of addressKeys) {
    if (!configuration.addresses[key].startsWith("addr_test1")) {
      issues.push(`The configured ${key} script address is missing or not testnet.`);
    }
  }
  return issues;
}

export function assertConfiguredAddressesMatch(
  graph: BootstrapGraph,
  configuration: BootstrapConfiguration,
): void {
  const mismatches = addressKeys.filter(
    (key) => configuration.addresses[key] !== graph.scripts[key].address,
  );
  if (mismatches.length > 0) {
    throw new BootstrapPreparationError(
      "CONFIG_MISMATCH",
      `The live seed derives a different contract graph for: ${mismatches.join(
        ", ",
      )}. Regenerate and review the deployment plan/config before preparing a transaction.`,
    );
  }
}

export function utxoReference(utxo: UTxO): string {
  return `${utxo.input.txHash}#${utxo.input.outputIndex}`;
}

export function lovelaceIn(utxo: UTxO): bigint {
  return utxo.output.amount
    .filter((asset) => asset.unit === "lovelace")
    .reduce((total, asset) => total + BigInt(asset.quantity), 0n);
}

export function isPureAdaUtxo(utxo: UTxO): boolean {
  return (
    utxo.output.amount.length === 1 &&
    utxo.output.amount[0]?.unit === "lovelace" &&
    lovelaceIn(utxo) > 0n
  );
}

export function selectBootstrapInputs(
  walletUtxos: UTxO[],
  collateralUtxos: UTxO[],
  adminPaymentCredential: string,
  minimumCollateralLovelace: number,
  resolvePaymentCredential: (address: string) => string,
): BootstrapInputSelection {
  const collateralReferences = new Set(collateralUtxos.map(utxoReference));
  const seedCandidates = walletUtxos
    .filter((utxo) => isPureAdaUtxo(utxo) && !collateralReferences.has(utxoReference(utxo)))
    .filter((utxo) => {
      try {
        return resolvePaymentCredential(utxo.output.address) === adminPaymentCredential;
      } catch {
        return false;
      }
    })
    .sort((left, right) => {
      const difference = lovelaceIn(right) - lovelaceIn(left);
      return difference === 0n
        ? utxoReference(left).localeCompare(utxoReference(right))
        : difference > 0n
          ? 1
          : -1;
    });
  const seed = seedCandidates[0];
  if (!seed || lovelaceIn(seed) < BOOTSTRAP_MIN_SEED_LOVELACE) {
    throw new BootstrapPreparationError(
      "SEED_NOT_FOUND",
      "No sufficiently funded pure-ADA admin UTxO is available outside the collateral set.",
    );
  }

  const collateral = collateralUtxos
    .filter(
      (utxo) =>
        utxoReference(utxo) !== utxoReference(seed) &&
        isPureAdaUtxo(utxo) &&
        lovelaceIn(utxo) >= BigInt(minimumCollateralLovelace),
    )
    .sort((left, right) => {
      const difference = lovelaceIn(left) - lovelaceIn(right);
      return difference === 0n
        ? utxoReference(left).localeCompare(utxoReference(right))
        : difference > 0n
          ? 1
          : -1;
    })[0];
  if (!collateral) {
    throw new BootstrapPreparationError(
      "COLLATERAL_REQUIRED",
      `Lace must designate a separate pure-ADA collateral UTxO with at least ${minimumCollateralLovelace} lovelace.`,
    );
  }
  return { seed, collateral };
}

function jsonConstructor(index: number, fields: object[] = []): object {
  return { constructor: index, fields };
}

function jsonBytes(value: string): object {
  return { bytes: value };
}

function jsonInt(value: number): object {
  return { int: value };
}

function jsonList(items: object[]): object {
  return { list: items };
}

function assetClassDatum(policyId: string, assetName: string): object {
  return jsonConstructor(0, [jsonBytes(policyId), jsonBytes(assetName)]);
}

export function buildDemoGenesisDatums(
  adminPaymentCredential: string,
  statePolicyId: string,
): { marketDatum: object; liquidityDatum: object } {
  const marketId = BOOTSTRAP_DEMO_MARKET.marketIdHex;
  const marketThread = assetClassDatum(statePolicyId, MARKET_STATE_NAME);
  const liquidityThread = assetClassDatum(statePolicyId, LIQUIDITY_STATE_NAME);
  const marketDatum = jsonConstructor(0, [
    jsonBytes(marketId),
    jsonBytes(BOOTSTRAP_DEMO_MARKET.termsHash),
    jsonBytes(BOOTSTRAP_DEMO_MARKET.metadataHash),
    jsonBytes(adminPaymentCredential),
    jsonBytes(adminPaymentCredential),
    jsonList([jsonBytes(adminPaymentCredential)]),
    jsonInt(1),
    jsonInt(BOOTSTRAP_DEMO_MARKET.tradingDeadlineMs),
    jsonInt(BOOTSTRAP_DEMO_MARKET.resolutionDeadlineMs),
    jsonInt(BOOTSTRAP_DEMO_MARKET.claimDeadlineMs),
    jsonBytes(BOOTSTRAP_DEMO_MARKET.resolutionCriteriaHash),
    jsonBytes(""),
    jsonInt(0),
    jsonInt(0),
    jsonInt(0),
    jsonInt(0),
    jsonInt(0),
    jsonInt(0),
    jsonConstructor(0, [jsonInt(10_000_000), jsonInt(25), jsonInt(100_000_000)]),
    jsonInt(0),
    jsonInt(0),
    jsonInt(0),
    jsonInt(0),
    jsonInt(100),
    jsonInt(0),
    jsonInt(Number(BOOTSTRAP_STATE_LOVELACE)),
    jsonConstructor(0),
    jsonConstructor(1),
    jsonConstructor(1),
    marketThread,
    liquidityThread,
  ]);
  const liquidityDatum = jsonConstructor(0, [
    jsonBytes(marketId),
    marketThread,
    liquidityThread,
    jsonInt(Number(BOOTSTRAP_STATE_LOVELACE)),
    jsonInt(0),
    jsonInt(0),
    jsonInt(0),
    jsonConstructor(0),
  ]);
  return { marketDatum, liquidityDatum };
}

export function buildBootstrapRedeemer(graph: BootstrapGraph): object {
  return jsonConstructor(0, [
    jsonBytes(graph.scripts.lifecycle.hash),
    jsonBytes(graph.scripts.liquidity.hash),
  ]);
}

export function assertBootstrapTransactionSize(
  unsignedTx: string,
  maxTxSize: number,
  signingMarginBytes = BOOTSTRAP_SIGNING_WITNESS_MARGIN_BYTES,
): number {
  const unsignedTxBytes = unsignedTx.length / 2;
  const projectedSignedBytes = unsignedTxBytes + signingMarginBytes;
  if (projectedSignedBytes > maxTxSize) {
    throw new BootstrapPreparationError(
      "BUILD_FAILED",
      `The ${unsignedTxBytes}-byte bootstrap plus ${signingMarginBytes} bytes of signing margin exceeds preprod maxTxSize ${maxTxSize}.`,
    );
  }
  return unsignedTxBytes;
}

export async function assembleBootstrapUnsignedTransaction(
  builder: BootstrapTxBuilder,
  input: {
    selection: BootstrapInputSelection;
    changeAddress: string;
    adminPaymentCredential: string;
    graph: BootstrapGraph;
    marketDatum: object;
    liquidityDatum: object;
    invalidHereafterSlot: number;
  },
): Promise<string> {
  const { seed, collateral } = input.selection;
  const redeemer = buildBootstrapRedeemer(input.graph);
  builder
    .setNetwork("preprod")
    .txIn(
      seed.input.txHash,
      seed.input.outputIndex,
      seed.output.amount,
      seed.output.address,
      0,
    )
    .inputForEvaluation(seed)
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .inputForEvaluation(collateral)
    .setTotalCollateral(BOOTSTRAP_TOTAL_COLLATERAL_LOVELACE)
    .setCollateralReturnAddress(input.changeAddress)
    .invalidHereafter(input.invalidHereafterSlot)
    .txOut(input.graph.scripts.lifecycle.address, [
      { unit: "lovelace", quantity: BOOTSTRAP_STATE_LOVELACE },
      { unit: input.graph.assets.market.unit, quantity: "1" },
    ])
    .txOutInlineDatumValue(input.marketDatum, "JSON")
    .txOut(input.graph.scripts.liquidity.address, [
      { unit: "lovelace", quantity: BOOTSTRAP_STATE_LOVELACE },
      { unit: input.graph.assets.liquidity.unit, quantity: "1" },
    ])
    .txOutInlineDatumValue(input.liquidityDatum, "JSON")
    .mintPlutusScriptV3()
    .mint("1", input.graph.statePolicy.policyId, MARKET_STATE_NAME)
    .mintingScript(input.graph.statePolicy.code)
    .mintRedeemerValue(redeemer, "JSON")
    .mintPlutusScriptV3()
    .mint("1", input.graph.statePolicy.policyId, LIQUIDITY_STATE_NAME)
    .mintingScript(input.graph.statePolicy.code)
    .mintRedeemerValue(redeemer, "JSON")
    .requiredSignerHash(input.adminPaymentCredential)
    .changeAddress(input.changeAddress);
  return builder.complete();
}

async function loadBundledBlueprint(): Promise<ContractBlueprint> {
  const response = await fetch(`${import.meta.env.BASE_URL}contracts/plutus.json`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new BootstrapPreparationError(
      "BLUEPRINT_INVALID",
      `Unable to load the bundled contract blueprint (${response.status}).`,
    );
  }
  return (await response.json()) as ContractBlueprint;
}

async function assertProviderStillUnspent(
  provider: { fetchAddressUTxOs(address: string): Promise<UTxO[]> },
  utxo: UTxO,
  code: "SEED_SPENT" | "COLLATERAL_SPENT",
  role: string,
): Promise<void> {
  let active: UTxO[];
  try {
    active = await provider.fetchAddressUTxOs(utxo.output.address);
  } catch (error) {
    throw new BootstrapPreparationError(
      "BLOCKFROST_UNAVAILABLE",
      `Blockfrost could not revalidate the ${role}: ${
        error instanceof Error ? error.message : "query failed"
      }`,
    );
  }
  if (!active.some((candidate) => utxoReference(candidate) === utxoReference(utxo))) {
    throw new BootstrapPreparationError(
      code,
      `The selected ${role} ${utxoReference(utxo)} is no longer unspent on preprod.`,
    );
  }
}

export async function prepareBootstrapDeployment(
  walletName: string,
): Promise<BootstrapPreparedReview> {
  if (walletName.toLowerCase() !== "lace") {
    throw new BootstrapPreparationError(
      "WRONG_WALLET",
      "Bootstrap signing is restricted to the connected Lace wallet.",
    );
  }
  const configuration = getBootstrapConfiguration();
  const configurationIssues = bootstrapConfigurationIssues(configuration);
  if (configurationIssues.length > 0) {
    throw new BootstrapPreparationError("CONFIG_REQUIRED", configurationIssues.join(" "));
  }

  const rawWallet = await connectedWalletApi(walletName);
  const networkId = await rawWallet.getNetworkId();
  if (networkId !== CONFIG.networkId) {
    throw new BootstrapPreparationError(
      "WRONG_NETWORK",
      "Switch Lace to Cardano testnet/preprod before preparing deployment.",
    );
  }

  const mesh = await import("@meshsdk/core");
  const browserWallet = await mesh.BrowserWallet.enable("lace");
  const [changeAddress, walletUtxos, collateralUtxos, blueprint] = await Promise.all([
    browserWallet.getChangeAddress(),
    browserWallet.getUtxos(),
    browserWallet.getCollateral().catch(() => []),
    loadBundledBlueprint(),
  ]);
  const walletCredential = mesh.resolvePaymentKeyHash(changeAddress);
  if (walletCredential !== configuration.adminPaymentCredential) {
    throw new BootstrapPreparationError(
      "WRONG_WALLET",
      "The Lace change address does not match VITE_ADMIN_PAYMENT_CREDENTIAL.",
    );
  }

  const selection = selectBootstrapInputs(
    walletUtxos,
    collateralUtxos,
    configuration.adminPaymentCredential,
    configuration.minimumCollateralLovelace,
    mesh.resolvePaymentKeyHash,
  );
  const provider = new mesh.BlockfrostProvider(configuration.blockfrostProjectId);
  await assertProviderStillUnspent(provider, selection.seed, "SEED_SPENT", "bootstrap seed");
  await assertProviderStillUnspent(
    provider,
    selection.collateral,
    "COLLATERAL_SPENT",
    "collateral UTxO",
  );

  const graph = deriveBootstrapGraph(
    blueprint,
    {
      txHash: selection.seed.input.txHash,
      outputIndex: selection.seed.input.outputIndex,
    },
    configuration.adminPaymentCredential,
    mesh,
  );
  assertConfiguredAddressesMatch(graph, configuration);

  let protocolParameters: Protocol;
  let latestSlot: number;
  try {
    const [parameters, latestBlock] = await Promise.all([
      provider.fetchProtocolParameters(),
      provider.fetchLatestBlock(),
    ]);
    protocolParameters = parameters;
    latestSlot = Number(latestBlock.slot);
    if (!Number.isSafeInteger(latestSlot) || latestSlot < 0) {
      throw new Error(`Blockfrost returned invalid latest slot ${latestBlock.slot}.`);
    }
  } catch (error) {
    throw new BootstrapPreparationError(
      "BLOCKFROST_UNAVAILABLE",
      `Blockfrost protocol parameters are unavailable: ${
        error instanceof Error ? error.message : "query failed"
      }`,
    );
  }
  const { marketDatum, liquidityDatum } = buildDemoGenesisDatums(
    configuration.adminPaymentCredential,
    graph.statePolicy.policyId,
  );
  const builder = new mesh.MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    params: protocolParameters,
  });
  const invalidHereafterSlot = latestSlot + BOOTSTRAP_TTL_SLOTS;
  let unsignedTx: string;
  try {
    unsignedTx = await assembleBootstrapUnsignedTransaction(builder, {
      selection,
      changeAddress,
      adminPaymentCredential: configuration.adminPaymentCredential,
      graph,
      marketDatum,
      liquidityDatum,
      invalidHereafterSlot,
    });
  } catch (error) {
    throw new BootstrapPreparationError(
      "BUILD_FAILED",
      `Mesh/Blockfrost could not build and evaluate the unsigned bootstrap transaction: ${
        error instanceof Error ? error.message : "build failed"
      }`,
    );
  }
  const unsignedTxBytes = assertBootstrapTransactionSize(
    unsignedTx,
    protocolParameters.maxTxSize,
  );
  return {
    status: "PREPARED_UNSIGNED",
    unsignedTx,
    unsignedTxHash: mesh.resolveTxHash(unsignedTx),
    unsignedTxBytes,
    invalidHereafterSlot,
    seed: selection.seed,
    collateral: selection.collateral,
    changeAddress,
    graph,
    marketDatum,
    liquidityDatum,
    outputs: [
      {
        role: "market",
        address: graph.scripts.lifecycle.address,
        lovelace: BOOTSTRAP_STATE_LOVELACE,
        assetUnit: graph.assets.market.unit,
      },
      {
        role: "liquidity",
        address: graph.scripts.liquidity.address,
        lovelace: BOOTSTRAP_STATE_LOVELACE,
        assetUnit: graph.assets.liquidity.unit,
      },
    ],
  };
}

export async function signAndSubmitBootstrap(
  walletName: string,
  review: BootstrapPreparedReview,
): Promise<string> {
  if (walletName.toLowerCase() !== "lace") {
    throw new BootstrapPreparationError(
      "WRONG_WALLET",
      "Bootstrap signing is restricted to Lace.",
    );
  }
  const configuration = getBootstrapConfiguration();
  const configurationIssues = bootstrapConfigurationIssues(configuration);
  if (configurationIssues.length > 0) {
    throw new BootstrapPreparationError("CONFIG_REQUIRED", configurationIssues.join(" "));
  }
  assertConfiguredAddressesMatch(review.graph, configuration);
  const rawWallet = await connectedWalletApi(walletName);
  if ((await rawWallet.getNetworkId()) !== CONFIG.networkId) {
    throw new BootstrapPreparationError(
      "WRONG_NETWORK",
      "Switch Lace back to Cardano testnet/preprod before signing.",
    );
  }
  try {
    const { BlockfrostProvider, BrowserWallet, resolvePaymentKeyHash, resolveTxHash } =
      await import("@meshsdk/core");
    if (resolveTxHash(review.unsignedTx) !== review.unsignedTxHash) {
      throw new BootstrapPreparationError(
        "REVIEW_MISMATCH",
        "The unsigned transaction no longer matches the reviewed transaction-body hash.",
      );
    }
    const wallet = await BrowserWallet.enable("lace");
    const [changeAddress, currentUtxos, currentCollateral] = await Promise.all([
      wallet.getChangeAddress(),
      wallet.getUtxos(),
      wallet.getCollateral().catch(() => []),
    ]);
    if (resolvePaymentKeyHash(changeAddress) !== configuration.adminPaymentCredential) {
      throw new BootstrapPreparationError(
        "WRONG_WALLET",
        "The current Lace change credential no longer matches the reviewed admin.",
      );
    }
    if (!currentUtxos.some((utxo) => utxoReference(utxo) === utxoReference(review.seed))) {
      throw new BootstrapPreparationError(
        "SEED_SPENT",
        `The reviewed seed ${utxoReference(review.seed)} is no longer present in Lace.`,
      );
    }
    if (
      !currentCollateral.some(
        (utxo) => utxoReference(utxo) === utxoReference(review.collateral),
      )
    ) {
      throw new BootstrapPreparationError(
        "COLLATERAL_SPENT",
        `The reviewed collateral ${utxoReference(review.collateral)} is no longer designated in Lace.`,
      );
    }
    const provider = new BlockfrostProvider(configuration.blockfrostProjectId);
    await assertProviderStillUnspent(provider, review.seed, "SEED_SPENT", "bootstrap seed");
    await assertProviderStillUnspent(
      provider,
      review.collateral,
      "COLLATERAL_SPENT",
      "collateral UTxO",
    );
    const latestBlock = await provider.fetchLatestBlock();
    const latestSlot = Number(latestBlock.slot);
    if (!Number.isSafeInteger(latestSlot) || latestSlot >= review.invalidHereafterSlot) {
      throw new BootstrapPreparationError(
        "REVIEW_EXPIRED",
        "The reviewed transaction has expired. Prepare and review a fresh unsigned transaction.",
      );
    }

    const signedTx = await wallet.signTx(review.unsignedTx, false, true);
    if (!signedTx || signedTx === review.unsignedTx) {
      throw new Error("Lace did not return a transaction witness.");
    }
    return await wallet.submitTx(signedTx);
  } catch (error) {
    if (error instanceof BootstrapPreparationError) throw error;
    throw new BootstrapPreparationError(
      "SIGNING_FAILED",
      error instanceof Error ? error.message : "Lace signing or submission failed.",
    );
  }
}
