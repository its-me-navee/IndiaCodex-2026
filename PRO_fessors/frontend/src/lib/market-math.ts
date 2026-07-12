import type { BinaryOutcome, CashOutQuote, Quote } from "@/types";

export const LP_FEE_RATE = 0.01;

export function boundProbability(value: number): number {
  return Math.min(0.99, Math.max(0.01, value));
}

export function openingProbability(yesCount: number, total: number): number | null {
  if (total !== 100) return null;
  return boundProbability(yesCount / 100);
}

export function buildQuote(
  probability: number,
  side: BinaryOutcome,
  amountAda: number,
  liquidityAda: number,
): Quote {
  const safeAmount = Math.max(0, amountAda);
  const feeAda = safeAmount * LP_FEE_RATE;
  const netAda = safeAmount - feeAda;
  const direction = side === "YES" ? 1 : -1;
  const depth = Math.max(250, liquidityAda * 0.16);
  const movement = Math.min(0.16, (netAda / (depth + netAda)) * 0.18);
  const resultingProbability = boundProbability(probability + direction * movement);
  const averageProbability = boundProbability((probability + resultingProbability) / 2);
  const selectedPrice = side === "YES" ? averageProbability : 1 - averageProbability;
  const shares = selectedPrice > 0 ? netAda / selectedPrice : 0;
  return {
    side,
    amountAda: safeAmount,
    feeAda,
    totalAda: safeAmount,
    shares,
    averageProbability,
    resultingProbability,
    priceImpact: Math.abs(resultingProbability - probability),
    maximumPayoutAda: shares,
  };
}

export function buildCashOutQuote(
  outcome: BinaryOutcome,
  shares: number,
  currentProbability: number,
  amountPaidAda: number,
): CashOutQuote {
  const selectedPrice = outcome === "YES" ? currentProbability : 1 - currentProbability;
  const grossAda = shares * selectedPrice;
  const feeAda = grossAda * LP_FEE_RATE;
  const proceedsAda = grossAda - feeAda;
  return {
    grossAda,
    feeAda,
    proceedsAda,
    realizedPnlAda: proceedsAda - amountPaidAda,
    resultingProbability: boundProbability(
      currentProbability + (outcome === "YES" ? -0.012 : 0.012),
    ),
  };
}

export function lpUnitsForDeposit(
  depositAda: number,
  reserveAda: number,
  totalUnits: number,
): number {
  if (depositAda <= 0) return 0;
  return reserveAda <= 0 || totalUnits <= 0
    ? depositAda
    : (depositAda * totalUnits) / reserveAda;
}
