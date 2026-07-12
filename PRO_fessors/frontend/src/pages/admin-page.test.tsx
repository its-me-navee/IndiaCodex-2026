import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONFIG } from "@/lib/config";
import { AdminPage } from "@/pages/admin-page";

const submitAction = vi.fn();

vi.mock("@/hooks/use-data", () => ({
  useDeploymentStatus: () => ({
    data: {
      network: "preprod",
      adminPaymentCredential: "ab".repeat(28),
      blockfrostQueryConfigured: true,
      scripts: [
        {
          script: "market_lifecycle",
          address: "addr_test1lifecycle",
          configured: true,
          observationStatus: "UNKNOWN",
          observed: null,
          detail: "Blockfrost query failed; chain observation is unknown.",
        },
        {
          script: "market",
          address: "addr_test1market",
          configured: true,
          observationStatus: "OBSERVED",
          observed: true,
          detail: "Blockfrost found address transaction history.",
        },
        {
          script: "market_settlement",
          address: "addr_test1settlement",
          configured: true,
          observationStatus: "NOT_OBSERVED",
          observed: false,
          detail: "Blockfrost found no address transaction history.",
        },
        {
          script: "liquidity",
          address: null,
          configured: false,
          observationStatus: "NOT_CONFIGURED",
          observed: null,
          detail: "No script address is configured.",
        },
        {
          script: "position",
          address: "addr_test1position",
          configured: true,
          observationStatus: "UNKNOWN",
          observed: null,
          detail: "Blockfrost querying is not configured; chain observation is unknown.",
        },
      ],
      checkedAt: "2026-07-12T10:00:00Z",
      caveat:
        "OBSERVED means Blockfrost found address transaction history. It does not prove a specific validator version, and configuration alone never means deployed.",
      source: "api",
    },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAdminDrafts: () => ({
    data: [
      {
        id: "draft-test",
        statement: "Will the test event happen before its deadline?",
        category: "Technology",
        creator: "addr_test1_demo",
        submittedAt: "2026-07-12T00:00:00Z",
        tradingDeadline: "2026-08-12T00:00:00Z",
        yesRule: "YES when the official source records the event before the deadline.",
        primarySource: "Official source",
        risk: "LOW",
        status: "PENDING",
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/lib/actions", () => ({
  submitAction: (...args: unknown[]) => submitAction(...args),
}));

describe("AdminPage resolution authority", () => {
  afterEach(cleanup);

  beforeEach(() => {
    submitAction.mockReset();
    submitAction.mockResolvedValue({ txHash: "demo", simulated: true });
  });

  it("collects one transparent admin signature instead of committee votes", async () => {
    const user = userEvent.setup();
    render(<AdminPage />);

    await user.click(screen.getByRole("button", { name: /admin resolution/i }));
    expect(screen.getByText("0/1 signature")).toBeInTheDocument();
    expect(screen.getByText(/trusted, centralized outcome decision/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sign yes as admin/i }));

    expect(await screen.findByText(/yes signed · 1-of-1/i)).toBeInTheDocument();
    expect(screen.getByText("1/1 signature")).toBeInTheDocument();
    expect(screen.getByText(/cannot withdraw the pool/i)).toBeInTheDocument();
    expect(submitAction).toHaveBeenCalledTimes(1);
    expect(submitAction).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          outcome: "YES",
          evidence_uri: "https://primary-source.example/result",
          admin_payment_credential: CONFIG.adminPaymentCredential,
        },
      }),
    );
  });

  it("shows backend address observations without presenting them as deployment proof", () => {
    render(<AdminPage />);

    expect(screen.getByRole("heading", { name: "Configured script addresses" })).toBeInTheDocument();
    expect(screen.getByText("Market lifecycle validator")).toBeInTheDocument();
    expect(screen.getByText("Market trading validator")).toBeInTheDocument();
    expect(screen.getByText("Market settlement validator")).toBeInTheDocument();
    expect(screen.getByText("addr_test1lifecycle")).toBeInTheDocument();
    expect(screen.getByText("addr_test1market")).toBeInTheDocument();
    expect(screen.getByText("addr_test1settlement")).toBeInTheDocument();
    expect(screen.getByText("addr_test1position")).toBeInTheDocument();
    expect(screen.getByText("OBSERVED")).toBeInTheDocument();
    expect(screen.getByText("NOT_OBSERVED")).toBeInTheDocument();
    expect(screen.getByText("NOT_CONFIGURED")).toBeInTheDocument();
    expect(screen.getAllByText("UNKNOWN")).toHaveLength(2);
    expect(screen.getByText("Observation is not deployment verification")).toBeInTheDocument();
    expect(screen.getByText(/does not prove a specific validator version/i)).toBeInTheDocument();
  });
});
