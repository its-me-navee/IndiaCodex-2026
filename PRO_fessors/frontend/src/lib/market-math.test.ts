import { describe, expect, it } from "vitest";

import {
  buildCashOutQuote,
  buildQuote,
  lpUnitsForDeposit,
  openingProbability,
} from "@/lib/market-math";

describe("ProbX market math", () => {
  it("reveals no opening probability until exactly 100 forecasts", () => {
    expect(openingProbability(49, 99)).toBeNull();
    expect(openingProbability(50, 100)).toBe(0.5);
  });

  it("bounds unanimous discovery to a tradable 1%-99%", () => {
    expect(openingProbability(100, 100)).toBe(0.99);
    expect(openingProbability(0, 100)).toBe(0.01);
  });

  it("sends exactly one percent of a purchase to market LPs", () => {
    const quote = buildQuote(0.6, "YES", 1_000, 100_000);
    expect(quote.feeAda).toBe(10);
    expect(quote.totalAda).toBe(1_000);
    expect(quote.resultingProbability).toBeGreaterThan(0.6);
  });

  it("quotes a complete cash-out and its one-percent LP fee", () => {
    const quote = buildCashOutQuote("YES", 2_000, 0.7, 1_000);
    expect(quote.grossAda).toBe(1_400);
    expect(quote.feeAda).toBe(14);
    expect(quote.proceedsAda).toBe(1_386);
    expect(quote.realizedPnlAda).toBe(386);
  });

  it("mints LP units pro rata after the first provider", () => {
    expect(lpUnitsForDeposit(500, 10_000, 8_000)).toBe(400);
    expect(lpUnitsForDeposit(500, 0, 0)).toBe(500);
  });
});
