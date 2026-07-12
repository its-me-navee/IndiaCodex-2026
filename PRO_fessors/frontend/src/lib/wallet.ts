import { CONFIG } from "@/lib/config";

interface Cip30WalletApi {
  getNetworkId(): Promise<number>;
  getChangeAddress(): Promise<string>;
  getBalance(): Promise<string>;
  getUtxos(): Promise<string[] | null | undefined>;
  getCollateral?(): Promise<string[] | null | undefined>;
  experimental?: {
    getCollateral?(): Promise<string[] | null | undefined>;
  };
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  submitTx(tx: string): Promise<string>;
}

interface Cip30Provider {
  enable(): Promise<Cip30WalletApi>;
}

export async function connectedWalletApi(walletName: string): Promise<Cip30WalletApi> {
  const cardano = (window as unknown as {
    cardano?: Record<string, Cip30Provider | undefined>;
  }).cardano;
  const provider = cardano?.[walletName.toLowerCase()];
  if (!provider) throw new Error(`${walletName} is not injected into this browser.`);
  return provider.enable();
}

export async function enabledWalletApi(walletName: string): Promise<Cip30WalletApi> {
  const api = await connectedWalletApi(walletName);
  const networkId = await api.getNetworkId();
  if (networkId !== CONFIG.networkId) throw new Error("Switch the wallet to Cardano preprod/testnet.");
  return api;
}

export type DeploymentPreflightStatus =
  | "READY"
  | "NEEDS_COLLATERAL"
  | "NEEDS_SPENDABLE"
  | "WRONG_WALLET"
  | "WRONG_NETWORK"
  | "CONFIG_REQUIRED";

export interface DeploymentWalletSnapshot {
  networkId: number;
  changeAddress: string;
  paymentCredential: string | null;
  utxoCount: number;
  totalUtxoLovelace: string;
  collateralCount: number;
  collateralLovelace: string;
}

export interface DeploymentPreflightResult {
  status: DeploymentPreflightStatus;
  title: string;
  detail: string;
  snapshot: DeploymentWalletSnapshot;
}

interface MeshUtxoLike {
  output: {
    amount: Array<{ unit: string; quantity: string }>;
  };
}

function sumLovelace(utxos: MeshUtxoLike[]): bigint {
  return utxos.reduce(
    (total, utxo) =>
      total +
      utxo.output.amount
        .filter((asset) => asset.unit === "lovelace")
        .reduce((subtotal, asset) => subtotal + BigInt(asset.quantity), 0n),
    0n,
  );
}

function normalizePaymentCredential(value: string): string {
  return value.toLowerCase().replace(/^0x/, "").trim();
}

export function classifyDeploymentWallet(
  snapshot: DeploymentWalletSnapshot,
  expectedPaymentCredential: string,
  minimumCollateralLovelace: number,
): DeploymentPreflightResult {
  const expected = normalizePaymentCredential(expectedPaymentCredential);
  if (snapshot.networkId !== CONFIG.networkId) {
    return {
      status: "WRONG_NETWORK",
      title: "Wrong network",
      detail: `Switch this wallet to Cardano ${CONFIG.network} (network id ${CONFIG.networkId}).`,
      snapshot,
    };
  }
  if (!/^[0-9a-f]{56}$/.test(expected)) {
    return {
      status: "CONFIG_REQUIRED",
      title: "Admin credential not configured",
      detail:
        "Set VITE_ADMIN_PAYMENT_CREDENTIAL to the 56-character payment key hash before deployment preflight can pass.",
      snapshot,
    };
  }
  if (!snapshot.paymentCredential || normalizePaymentCredential(snapshot.paymentCredential) !== expected) {
    return {
      status: "WRONG_WALLET",
      title: "Wrong admin wallet",
      detail:
        "The connected change address does not use the payment credential configured for the deployment admin.",
      snapshot,
    };
  }
  const collateral = BigInt(snapshot.collateralLovelace);
  if (snapshot.collateralCount === 0 || collateral < BigInt(minimumCollateralLovelace)) {
    return {
      status: "NEEDS_COLLATERAL",
      title: "Needs collateral",
      detail: `Create a pure-ADA collateral UTxO of at least ${minimumCollateralLovelace / 1_000_000} tADA and keep a separate spendable UTxO.`,
      snapshot,
    };
  }
  if (snapshot.utxoCount < 2) {
    return {
      status: "NEEDS_SPENDABLE",
      title: "Needs a separate spendable UTxO",
      detail:
        "Keep at least two wallet UTxOs: one designated as collateral and a different UTxO for deployment funding/bootstrap inputs.",
      snapshot,
    };
  }
  return {
    status: "READY",
    title: "Wallet ready",
    detail:
      "Network, admin payment credential, spendable UTxOs, and collateral pass the read-only preflight.",
    snapshot,
  };
}

/**
 * Read-only CIP-30 deployment preflight. It requests network, change address,
 * UTxOs, and collateral only. It never requests a private key, signature, or
 * transaction submission. Mesh is loaded lazily to decode wallet data and
 * derive the change address payment credential.
 */
export async function inspectDeploymentWallet(
  walletName: string,
  expectedPaymentCredential = CONFIG.adminPaymentCredential,
  minimumCollateralLovelace = CONFIG.deploymentMinCollateralLovelace,
): Promise<DeploymentPreflightResult> {
  const api = await connectedWalletApi(walletName);
  const collateralReader =
    api.getCollateral?.bind(api) ?? api.experimental?.getCollateral?.bind(api.experimental);
  const [networkId, rawChangeAddress, rawUtxos, rawCollateral] = await Promise.all([
    api.getNetworkId(),
    api.getChangeAddress(),
    api.getUtxos(),
    collateralReader ? collateralReader().catch(() => undefined) : Promise.resolve(undefined),
  ]);

  const { BrowserWallet, resolvePaymentKeyHash } = await import("@meshsdk/core");
  const meshWallet = await BrowserWallet.enable(walletName.toLowerCase());
  const [changeAddress, utxos, collateral] = await Promise.all([
    meshWallet.getChangeAddress(),
    meshWallet.getUtxos(),
    meshWallet.getCollateral().catch(() => []),
  ]);
  let paymentCredential: string | null = null;
  try {
    paymentCredential = resolvePaymentKeyHash(changeAddress);
  } catch {
    paymentCredential = null;
  }
  const snapshot: DeploymentWalletSnapshot = {
    networkId,
    changeAddress: changeAddress || `cbor:${rawChangeAddress.slice(0, 24)}…`,
    paymentCredential,
    utxoCount: rawUtxos?.length ?? utxos.length,
    totalUtxoLovelace: sumLovelace(utxos as MeshUtxoLike[]).toString(),
    collateralCount: rawCollateral?.length ?? collateral.length,
    collateralLovelace: sumLovelace(collateral as MeshUtxoLike[]).toString(),
  };
  return classifyDeploymentWallet(
    snapshot,
    expectedPaymentCredential,
    minimumCollateralLovelace,
  );
}

export async function signAndSubmit(walletName: string, unsignedTx: string): Promise<string> {
  await enabledWalletApi(walletName);
  const { BrowserWallet } = await import("@meshsdk/core");
  const wallet = await BrowserWallet.enable(walletName.toLowerCase());
  const signed = await wallet.signTx(unsignedTx, true, true);
  return wallet.submitTx(signed);
}

export interface MeshOutputPlan {
  address: string;
  lovelace: string;
}

export interface MeshTransactionPlan {
  changeAddress: string;
  walletUtxos: Array<{
    input: { txHash: string; outputIndex: number };
    output: { address: string; amount: Array<{ unit: string; quantity: string }> };
  }>;
  outputs: MeshOutputPlan[];
  metadata?: Record<string, unknown>;
}

/**
 * Mesh boundary for deterministic direct-build plans. In the MVP, the FastAPI
 * payload endpoints normally return unsigned CBOR; this path keeps direct Mesh
 * transaction construction isolated for contract deployment integration.
 */
export async function buildFromMeshPlan(plan: MeshTransactionPlan): Promise<string> {
  const { MeshTxBuilder } = await import("@meshsdk/core");
  const builder = new MeshTxBuilder();
  for (const output of plan.outputs) {
    builder.txOut(output.address, [{ unit: "lovelace", quantity: output.lovelace }]);
  }
  if (plan.metadata) builder.metadataValue(674, plan.metadata);
  return builder
    .changeAddress(plan.changeAddress)
    .selectUtxosFrom(plan.walletUtxos)
    .complete();
}
