import { describe, expect, it } from "vitest";

import { demoDeploymentStatus } from "@/data/demo";
import { normalizeDeploymentStatus, normalizeMarket } from "@/lib/api";
import { DEPLOYMENT_SCRIPT_NAMES } from "@/types";

const baseline = {
  id: "market-1",
  statement: "Will the test condition happen before the deadline?",
  category: "Technology",
  status: "TRADING",
  opening_forecast_count: 100,
  opening_yes_count: 1,
  opening_no_count: 99,
  yes_probability: 1,
  liquidity_lovelace: 100_000_000,
  volume_lovelace: 25_000_000,
  trading_deadline: "2026-10-01T00:00:00Z",
  resolution_deadline: "2026-10-02T00:00:00Z",
};

describe("backend market normalization", () => {
  it("treats backend probabilities as integer percentages", () => {
    expect(normalizeMarket(baseline).yesProbability).toBe(0.01);
  });

  it("never exposes a probability while discovery is incomplete", () => {
    expect(normalizeMarket({ ...baseline, status: "PRICE_DISCOVERY", opening_forecast_count: 74, yes_probability: 58 }).yesProbability).toBeNull();
  });

  it("maps backend VOIDED to the frontend VOID terminal state", () => {
    expect(normalizeMarket({ ...baseline, status: "VOIDED" }).status).toBe("VOID");
  });

  it("uses the backend-aligned 100 ADA minimum-liquidity fallback", () => {
    expect(normalizeMarket(baseline).minimumLiquidityAda).toBe(100);
  });
});

describe("deployment-status normalization", () => {
  it("preserves backend observation states and caveat without claiming deployment", () => {
    const caveat =
      "OBSERVED means Blockfrost found address transaction history. It does not prove a specific validator version.";
    const result = normalizeDeploymentStatus({
      network: "preprod",
      admin_payment_credential: "ab".repeat(28),
      blockfrost_query_configured: true,
      scripts: [
        {
          script: "position",
          address: null,
          configured: false,
          observation_status: "NOT_CONFIGURED",
          observed: null,
          detail: "No script address is configured.",
        },
        {
          script: "market",
          address: "addr_test1market",
          configured: true,
          observation_status: "OBSERVED",
          observed: true,
          detail: "Blockfrost found address transaction history.",
        },
        {
          script: "market_settlement",
          address: "addr_test1settlement",
          configured: true,
          observation_status: "NOT_OBSERVED",
          observed: false,
          detail: "Blockfrost found no address transaction history.",
        },
        {
          script: "liquidity",
          address: null,
          configured: false,
          observation_status: "NOT_CONFIGURED",
          observed: null,
          detail: "No script address is configured.",
        },
        {
          script: "market_lifecycle",
          address: "addr_test1lifecycle",
          configured: true,
          observation_status: "UNKNOWN",
          observed: null,
          detail: "Blockfrost query failed; chain observation is unknown.",
        },
      ],
      checked_at: "2026-07-12T10:00:00Z",
      caveat,
    });

    expect(result.scripts.map((item) => item.script)).toEqual(DEPLOYMENT_SCRIPT_NAMES);
    expect(result.scripts.map((item) => item.observationStatus)).toEqual([
      "UNKNOWN",
      "OBSERVED",
      "NOT_OBSERVED",
      "NOT_CONFIGURED",
      "NOT_CONFIGURED",
    ]);
    expect(result.caveat).toBe(caveat);
    expect(result.source).toBe("api");
  });

  it("maps missing or unfamiliar observations to UNKNOWN", () => {
    const result = normalizeDeploymentStatus({
      network: "preprod",
      admin_payment_credential: "",
      blockfrost_query_configured: false,
      scripts: [
        {
          script: "market",
          address: "addr_test1market",
          configured: true,
          observation_status: "UNRECOGNIZED",
          observed: null,
          detail: "Unexpected upstream state.",
        },
      ],
      checked_at: "2026-07-12T10:00:00Z",
      caveat: "Observation does not prove deployment.",
    });

    expect(result.scripts).toHaveLength(5);
    expect(result.scripts.every((item) => item.observationStatus === "UNKNOWN")).toBe(true);
  });

  it("keeps demo fallback observations unknown instead of fabricating chain history", () => {
    expect(demoDeploymentStatus.source).toBe("demo");
    expect(demoDeploymentStatus.scripts.map((item) => item.script)).toEqual(
      DEPLOYMENT_SCRIPT_NAMES,
    );
    expect(
      demoDeploymentStatus.scripts.every(
        (item) =>
          item.observationStatus === "UNKNOWN" && item.observed === null && item.address === null,
      ),
    ).toBe(true);
    expect(demoDeploymentStatus.caveat).toMatch(/never simulates/i);
  });
});
