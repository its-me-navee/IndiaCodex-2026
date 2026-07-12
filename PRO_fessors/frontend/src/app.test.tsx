import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const walletMocks = vi.hoisted(() => ({
  connectButtonProps: vi.fn(),
}));

vi.mock("@cardano-foundation/cardano-connect-with-wallet", () => ({
  ConnectWalletButton: (props: Record<string, unknown>) => {
    walletMocks.connectButtonProps(props);
    return <button>Connect wallet</button>;
  },
  useCardano: () => ({
    isConnected: false,
    isConnecting: false,
    enabledWallet: null,
    usedAddresses: [],
    unusedAddresses: [],
    accountBalance: null,
  }),
}));

vi.mock("@cardano-foundation/cardano-connect-with-wallet-core", () => ({
  NetworkType: { TESTNET: "TESTNET" },
}));

import App from "@/app";
import { AppProviders } from "@/components/providers";

describe("ProbX application", () => {
  it("renders the market directory with demo fallback", async () => {
    render(
      <MemoryRouter initialEntries={["/markets"]}>
        <AppProviders><App /></AppProviders>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: /Every statement\. One public state\./i })).toBeInTheDocument();
    expect(await screen.findByText(/Will ADA trade at or above \$1\.00/i)).toBeInTheDocument();
    expect(walletMocks.connectButtonProps).toHaveBeenCalledWith(
      expect.objectContaining({ limitNetwork: "TESTNET" }),
    );
  });
});
