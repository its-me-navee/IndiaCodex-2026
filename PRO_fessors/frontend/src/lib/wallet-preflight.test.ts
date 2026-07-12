import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyDeploymentWallet,
  inspectDeploymentWallet,
  type DeploymentWalletSnapshot,
} from "@/lib/wallet";

const mesh = vi.hoisted(() => ({
  enable: vi.fn(),
  resolvePaymentKeyHash: vi.fn(),
}));

vi.mock("@meshsdk/core", () => ({
  BrowserWallet: { enable: mesh.enable },
  resolvePaymentKeyHash: mesh.resolvePaymentKeyHash,
}));

const expectedCredential = "ab".repeat(28);

function snapshot(
  overrides: Partial<DeploymentWalletSnapshot> = {},
): DeploymentWalletSnapshot {
  return {
    networkId: 0,
    changeAddress: "addr_test1_admin",
    paymentCredential: expectedCredential,
    utxoCount: 2,
    totalUtxoLovelace: "25000000",
    collateralCount: 1,
    collateralLovelace: "5000000",
    ...overrides,
  };
}

describe("deployment wallet preflight", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "cardano");
  });

  it.each([
    ["READY", snapshot()],
    ["NEEDS_COLLATERAL", snapshot({ collateralCount: 0, collateralLovelace: "0" })],
    ["NEEDS_SPENDABLE", snapshot({ utxoCount: 1, totalUtxoLovelace: "5000000" })],
    ["WRONG_WALLET", snapshot({ paymentCredential: "cd".repeat(28) })],
    ["WRONG_NETWORK", snapshot({ networkId: 1 })],
    ["CONFIG_REQUIRED", snapshot()],
  ] as const)("returns %s with an explicit readiness reason", (status, walletSnapshot) => {
    const result = classifyDeploymentWallet(
      walletSnapshot,
      status === "CONFIG_REQUIRED" ? "not-configured" : expectedCredential,
      5_000_000,
    );
    expect(result.status).toBe(status);
    expect(result.title).toBeTruthy();
    expect(result.detail).toBeTruthy();
  });

  it("reads only CIP-30 public wallet state and derives the credential lazily with Mesh", async () => {
    const signTx = vi.fn();
    const submitTx = vi.fn();
    const rawApi = {
      getNetworkId: vi.fn().mockResolvedValue(0),
      getChangeAddress: vi.fn().mockResolvedValue("00aabb"),
      getBalance: vi.fn().mockResolvedValue("1a000000"),
      getUtxos: vi.fn().mockResolvedValue(["utxo-a", "utxo-b"]),
      getCollateral: vi.fn().mockResolvedValue(["collateral-a"]),
      signTx,
      submitTx,
    };
    Object.defineProperty(window, "cardano", {
      configurable: true,
      value: { lace: { enable: vi.fn().mockResolvedValue(rawApi) } },
    });
    mesh.resolvePaymentKeyHash.mockReturnValue(expectedCredential);
    mesh.enable.mockResolvedValue({
      getChangeAddress: vi.fn().mockResolvedValue("addr_test1_admin"),
      getUtxos: vi.fn().mockResolvedValue([
        { output: { amount: [{ unit: "lovelace", quantity: "15000000" }] } },
        { output: { amount: [{ unit: "lovelace", quantity: "10000000" }] } },
      ]),
      getCollateral: vi.fn().mockResolvedValue([
        { output: { amount: [{ unit: "lovelace", quantity: "5000000" }] } },
      ]),
    });

    const result = await inspectDeploymentWallet("Lace", expectedCredential, 5_000_000);

    expect(result.status).toBe("READY");
    expect(result.snapshot).toMatchObject({
      networkId: 0,
      changeAddress: "addr_test1_admin",
      paymentCredential: expectedCredential,
      utxoCount: 2,
      totalUtxoLovelace: "25000000",
      collateralCount: 1,
      collateralLovelace: "5000000",
    });
    expect(rawApi.getNetworkId).toHaveBeenCalledOnce();
    expect(rawApi.getChangeAddress).toHaveBeenCalledOnce();
    expect(rawApi.getUtxos).toHaveBeenCalledOnce();
    expect(rawApi.getCollateral).toHaveBeenCalledOnce();
    expect(mesh.enable).toHaveBeenCalledWith("lace");
    expect(mesh.resolvePaymentKeyHash).toHaveBeenCalledWith("addr_test1_admin");
    expect(signTx).not.toHaveBeenCalled();
    expect(submitTx).not.toHaveBeenCalled();
  });
});
