import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BootstrapPreparedReview } from "@/lib/bootstrap-deployment";

const bootstrapMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  signAndSubmit: vi.fn(),
  configurationIssues: [] as string[],
}));

vi.mock("@/lib/bootstrap-deployment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bootstrap-deployment")>();
  return {
    ...actual,
    bootstrapConfigurationIssues: () => [...bootstrapMocks.configurationIssues],
    prepareBootstrapDeployment: (...args: unknown[]) => bootstrapMocks.prepare(...args),
    signAndSubmitBootstrap: (...args: unknown[]) => bootstrapMocks.signAndSubmit(...args),
  };
});

import { BootstrapDeploymentWizard } from "@/components/bootstrap-deployment";
import { BootstrapPreparationError } from "@/lib/bootstrap-deployment";
import { useAppStore } from "@/store/app-store";

const admin = "ab".repeat(28);

function preparedReview(): BootstrapPreparedReview {
  const script = (role: string) => ({
    code: `${role}-code`,
    hash: `${role.padEnd(56, "0")}`.slice(0, 56),
    address: `addr_test1${role}`,
    appliedBytes: 100,
  });
  return {
    status: "PREPARED_UNSIGNED",
    unsignedTx: "84a400",
    unsignedTxHash: "11".repeat(32),
    unsignedTxBytes: 3,
    invalidHereafterSlot: 123_456,
    seed: {
      input: { txHash: "22".repeat(32), outputIndex: 2 },
      output: {
        address: "addr_test1seed",
        amount: [{ unit: "lovelace", quantity: "9990896192" }],
      },
    },
    collateral: {
      input: { txHash: "33".repeat(32), outputIndex: 0 },
      output: {
        address: "addr_test1collateral",
        amount: [{ unit: "lovelace", quantity: "5000000" }],
      },
    },
    changeAddress: "addr_test1change",
    graph: {
      statePolicy: { code: "policy-code", policyId: "44".repeat(28), appliedBytes: 100 },
      scripts: {
        lifecycle: script("lifecycle"),
        trading: script("trading"),
        settlement: script("settlement"),
        liquidity: script("liquidity"),
        position: script("position"),
      },
      support: {
        positionPolicyId: "55".repeat(28),
        lpReceiptScriptHash: "66".repeat(28),
        lpReceiptPolicyId: "77".repeat(28),
      },
      assets: {
        market: { name: "market", unit: "44".repeat(28) + "market" },
        liquidity: { name: "liquidity", unit: "44".repeat(28) + "liquidity" },
      },
    },
    marketDatum: { constructor: 0, fields: [] },
    liquidityDatum: { constructor: 0, fields: [] },
    outputs: [
      {
        role: "market",
        address: "addr_test1lifecycle",
        lovelace: "3000000",
        assetUnit: "market-unit",
      },
      {
        role: "liquidity",
        address: "addr_test1liquidity",
        lovelace: "3000000",
        assetUnit: "liquidity-unit",
      },
    ],
  };
}

describe("BootstrapDeploymentWizard", () => {
  beforeEach(() => {
    bootstrapMocks.prepare.mockReset();
    bootstrapMocks.signAndSubmit.mockReset();
    bootstrapMocks.configurationIssues.length = 0;
    useAppStore.getState().setWallet({
      connected: true,
      connecting: false,
      name: "Lace",
      address: "addr_test1change",
      balanceAda: 10_000,
      networkId: 0,
    });
  });

  afterEach(() => {
    cleanup();
    useAppStore.setState({ toasts: [] });
  });

  it("prepares without signing, then signs only after the explicit second click", async () => {
    const user = userEvent.setup();
    const review = preparedReview();
    bootstrapMocks.prepare.mockResolvedValue(review);
    bootstrapMocks.signAndSubmit.mockResolvedValue("88".repeat(32));
    render(<BootstrapDeploymentWizard />);

    await user.click(screen.getByRole("button", { name: /prepare & review unsigned tx/i }));

    expect(await screen.findByRole("heading", { name: "PREPARED_UNSIGNED" })).toBeInTheDocument();
    expect(bootstrapMocks.prepare).toHaveBeenCalledWith("Lace");
    expect(bootstrapMocks.signAndSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /sign & submit in lace/i }));

    expect(bootstrapMocks.signAndSubmit).toHaveBeenCalledWith("Lace", review);
    expect(await screen.findAllByText("SUBMITTED_UNCONFIRMED")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /888888/i })).toHaveAttribute(
      "href",
      expect.stringContaining(`/transaction/${"88".repeat(32)}`),
    );
    expect(screen.getByText(/does not claim inclusion/i)).toBeInTheDocument();
  });

  it("disables preparation when required deployment configuration is missing", () => {
    bootstrapMocks.configurationIssues.push("The configured settlement address is missing.");
    render(<BootstrapDeploymentWizard />);

    expect(screen.getByText("CONFIG_REQUIRED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /prepare & review unsigned tx/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /sign & submit in lace/i })).toBeDisabled();
  });

  it("surfaces CONFIG_MISMATCH and never exposes signing after a stale graph", async () => {
    const user = userEvent.setup();
    bootstrapMocks.prepare.mockRejectedValue(
      new BootstrapPreparationError("CONFIG_MISMATCH", "Settlement address is stale."),
    );
    render(<BootstrapDeploymentWizard />);

    await user.click(screen.getByRole("button", { name: /prepare & review unsigned tx/i }));

    expect(await screen.findByText("CONFIG_MISMATCH")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign & submit in lace/i })).toBeDisabled();
    expect(bootstrapMocks.signAndSubmit).not.toHaveBeenCalled();
  });
});
