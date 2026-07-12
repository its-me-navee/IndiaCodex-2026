import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BootstrapPreparedReview } from "@/lib/bootstrap-deployment";

const admin = "ab".repeat(28);
const addresses = {
  lifecycle: "addr_test1lifecycle",
  trading: "addr_test1trading",
  settlement: "addr_test1settlement",
  liquidity: "addr_test1liquidity",
  position: "addr_test1position",
};

const mesh = vi.hoisted(() => ({
  enable: vi.fn(),
  fetchAddressUTxOs: vi.fn(),
  fetchLatestBlock: vi.fn(),
  provider: vi.fn(),
  resolvePaymentKeyHash: vi.fn(),
  resolveTxHash: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  CONFIG: {
    network: "preprod",
    networkId: 0,
    blockfrostProjectId: "preprod_project",
    adminPaymentCredential: "ab".repeat(28),
    marketLifecycleScriptAddress: "addr_test1lifecycle",
    marketScriptAddress: "addr_test1trading",
    marketSettlementScriptAddress: "addr_test1settlement",
    liquidityScriptAddress: "addr_test1liquidity",
    positionScriptAddress: "addr_test1position",
    deploymentMinCollateralLovelace: 5_000_000,
  },
}));

vi.mock("@meshsdk/core", () => ({
  BlockfrostProvider: mesh.provider,
  BrowserWallet: { enable: mesh.enable },
  resolvePaymentKeyHash: mesh.resolvePaymentKeyHash,
  resolveTxHash: mesh.resolveTxHash,
}));

import { signAndSubmitBootstrap } from "@/lib/bootstrap-deployment";

function review(): BootstrapPreparedReview {
  const seed = {
    input: { txHash: "22".repeat(32), outputIndex: 2 },
    output: {
      address: "addr_test1seed",
      amount: [{ unit: "lovelace", quantity: "9990896192" }],
    },
  };
  const collateral = {
    input: { txHash: "33".repeat(32), outputIndex: 0 },
    output: {
      address: "addr_test1collateral",
      amount: [{ unit: "lovelace", quantity: "5000000" }],
    },
  };
  const script = (key: keyof typeof addresses) => ({
    code: `${key}-code`,
    hash: "44".repeat(28),
    address: addresses[key],
    appliedBytes: 100,
  });
  return {
    status: "PREPARED_UNSIGNED",
    unsignedTx: "unsigned-cbor",
    unsignedTxHash: "11".repeat(32),
    unsignedTxBytes: 10,
    invalidHereafterSlot: 123_456,
    seed,
    collateral,
    changeAddress: "addr_test1change",
    graph: {
      statePolicy: { code: "policy", policyId: "55".repeat(28), appliedBytes: 100 },
      scripts: {
        lifecycle: script("lifecycle"),
        trading: script("trading"),
        settlement: script("settlement"),
        liquidity: script("liquidity"),
        position: script("position"),
      },
      support: {
        positionPolicyId: "66".repeat(28),
        lpReceiptScriptHash: "77".repeat(28),
        lpReceiptPolicyId: "88".repeat(28),
      },
      assets: {
        market: { name: "market", unit: "market-unit" },
        liquidity: { name: "liquidity", unit: "liquidity-unit" },
      },
    },
    marketDatum: {},
    liquidityDatum: {},
    outputs: [],
  };
}

describe("bootstrap Lace signing boundary", () => {
  beforeEach(() => {
    mesh.enable.mockReset();
    mesh.fetchAddressUTxOs.mockReset();
    mesh.fetchLatestBlock.mockReset();
    mesh.provider.mockReset();
    mesh.resolvePaymentKeyHash.mockReset();
    mesh.resolveTxHash.mockReset();
    mesh.provider.mockImplementation(function MockBlockfrostProvider() {
      return {
        fetchAddressUTxOs: mesh.fetchAddressUTxOs,
        fetchLatestBlock: mesh.fetchLatestBlock,
      };
    });
    mesh.resolvePaymentKeyHash.mockReturnValue(admin);
    mesh.resolveTxHash.mockReturnValue("11".repeat(32));
    mesh.fetchLatestBlock.mockResolvedValue({ slot: "123000" });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "cardano");
  });

  it("revalidates the review and live inputs before requesting one full Lace transaction", async () => {
    const prepared = review();
    const rawApi = { getNetworkId: vi.fn().mockResolvedValue(0) };
    Object.defineProperty(window, "cardano", {
      configurable: true,
      value: { lace: { enable: vi.fn().mockResolvedValue(rawApi) } },
    });
    const signTx = vi.fn().mockResolvedValue("signed-full-cbor");
    const submitTx = vi.fn().mockResolvedValue("ab".repeat(32));
    mesh.enable.mockResolvedValue({
      getChangeAddress: vi.fn().mockResolvedValue("addr_test1change"),
      getUtxos: vi.fn().mockResolvedValue([prepared.seed]),
      getCollateral: vi.fn().mockResolvedValue([prepared.collateral]),
      signTx,
      submitTx,
    });
    mesh.fetchAddressUTxOs.mockResolvedValue([prepared.seed, prepared.collateral]);

    await expect(signAndSubmitBootstrap("Lace", prepared)).resolves.toBe("ab".repeat(32));

    expect(mesh.resolveTxHash).toHaveBeenCalledWith(prepared.unsignedTx);
    expect(mesh.fetchAddressUTxOs).toHaveBeenCalledTimes(2);
    expect(signTx).toHaveBeenCalledWith(prepared.unsignedTx, false, true);
    expect(Math.max(...mesh.fetchAddressUTxOs.mock.invocationCallOrder)).toBeLessThan(
      signTx.mock.invocationCallOrder[0]!,
    );
    expect(submitTx).toHaveBeenCalledWith("signed-full-cbor");
  });

  it("does not open Lace when the unsigned body differs from the reviewed hash", async () => {
    const prepared = review();
    Object.defineProperty(window, "cardano", {
      configurable: true,
      value: {
        lace: { enable: vi.fn().mockResolvedValue({ getNetworkId: vi.fn().mockResolvedValue(0) }) },
      },
    });
    mesh.resolveTxHash.mockReturnValue("ff".repeat(32));

    await expect(signAndSubmitBootstrap("Lace", prepared)).rejects.toMatchObject({
      code: "REVIEW_MISMATCH",
    });
    expect(mesh.enable).not.toHaveBeenCalled();
  });

  it("rejects non-Lace wallets before requesting a signature", async () => {
    await expect(signAndSubmitBootstrap("Eternl", review())).rejects.toMatchObject({
      code: "WRONG_WALLET",
    });
    expect(mesh.enable).not.toHaveBeenCalled();
  });
});
