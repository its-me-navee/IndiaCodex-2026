export type BinaryOutcome = "YES" | "NO";
export type ResolutionOutcome = BinaryOutcome | "VOID";
export type MarketStatus =
  | "DRAFT"
  | "PRICE_DISCOVERY"
  | "FUNDING"
  | "TRADING"
  | "CLOSED"
  | "RESOLVED"
  | "VOID";

export interface OpeningForecast {
  count: number;
  yesCount: number;
  noCount: number;
  target: 100;
  pollRoot: string | null;
  simulated: boolean;
  confirmedBy: number;
}

export interface ChartPoint {
  time: string;
  probability: number;
  volume: number;
}

export interface MarketActivity {
  id: string;
  type: "FORECAST" | "BUY" | "CASH_OUT" | "LIQUIDITY" | "RESOLUTION";
  wallet: string;
  outcome?: ResolutionOutcome;
  amountAda?: number;
  probability?: number;
  timestamp: string;
  txHash?: string;
  simulated?: boolean;
}

export interface Market {
  id: string;
  statement: string;
  description: string;
  category: string;
  status: MarketStatus;
  yesProbability: number | null;
  openingForecast: OpeningForecast;
  liquidityAda: number;
  minimumLiquidityAda: number;
  volumeAda: number;
  predictionPoolAda: number;
  availableLiquidityAda: number;
  yesLiabilityAda: number;
  noLiabilityAda: number;
  liquidityFeeBps: 100;
  tradingDeadline: string;
  resolutionDeadline: string;
  yesRule: string;
  primarySource: string;
  backupSource: string;
  invalidRule: string;
  creator: string;
  resolutionOutcome: ResolutionOutcome | null;
  simulation: boolean;
  featured: boolean;
  chart: ChartPoint[];
  activity: MarketActivity[];
}

export interface Position {
  id: string;
  marketId: string;
  statement: string;
  outcome: BinaryOutcome;
  amountPaidAda: number;
  shares: number;
  entryProbability: number;
  currentProbability: number;
  estimatedValueAda: number;
  maximumPayoutAda: number;
  realizedPnlAda: number | null;
  status: "OPEN" | "CASHED_OUT" | "WON" | "LOST" | "VOIDED";
  createdAt: string;
}

export interface LpReceipt {
  id: string;
  marketId: string;
  statement: string;
  depositedAda: number;
  lpUnits: number;
  poolShare: number;
  estimatedValueAda: number;
  feesEarnedAda: number;
  status: "LOCKED" | "REDEEMABLE" | "REDEEMED";
}

export interface LiquidityState {
  marketId: string;
  reserveAda: number;
  minimumAda: number;
  availableAda: number;
  totalLpUnits: number;
  providerCount: number;
  feesEarnedAda: number;
  feeBps: 100;
  yesLiabilityAda: number;
  noLiabilityAda: number;
  receipts: LpReceipt[];
}

export interface Portfolio {
  wallet: string;
  availableAda: number;
  committedAda: number;
  estimatedValueAda: number;
  realizedPnlAda: number;
  unrealizedPnlAda: number;
  positions: Position[];
  lpReceipts: LpReceipt[];
}

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  realizedPnlAda: number;
  accuracy: number;
  resolvedPositions: number;
  volumeAda: number;
  streak: number;
}

export interface SimulationStatus {
  running: boolean;
  seed: number;
  personas: number;
  actionsPerMinute: number;
  queuedActions: number;
  backedTransactions: number;
  databaseEvents: number;
  websocketClients: number;
  strategies: Array<{ name: string; personas: number; pnlAda: number; color: string }>;
  recentActions: MarketActivity[];
}

export const DEPLOYMENT_SCRIPT_NAMES = [
  "market_lifecycle",
  "market",
  "market_settlement",
  "liquidity",
  "position",
] as const;

export type DeploymentScriptName = (typeof DEPLOYMENT_SCRIPT_NAMES)[number];
export type DeploymentObservationStatus =
  | "NOT_CONFIGURED"
  | "OBSERVED"
  | "NOT_OBSERVED"
  | "UNKNOWN";

export interface DeploymentScriptStatus {
  script: DeploymentScriptName;
  address: string | null;
  configured: boolean | null;
  observationStatus: DeploymentObservationStatus;
  observed: boolean | null;
  detail: string;
}

export interface DeploymentStatus {
  network: "preprod";
  adminPaymentCredential: string;
  blockfrostQueryConfigured: boolean;
  scripts: DeploymentScriptStatus[];
  checkedAt: string | null;
  caveat: string;
  source: "api" | "demo";
}

export interface AdminDraft {
  id: string;
  statement: string;
  category: string;
  creator: string;
  submittedAt: string;
  tradingDeadline: string;
  yesRule: string;
  primarySource: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING" | "CHANGES_REQUESTED" | "APPROVED";
}

export interface Quote {
  side: BinaryOutcome;
  amountAda: number;
  feeAda: number;
  totalAda: number;
  shares: number;
  averageProbability: number;
  resultingProbability: number;
  priceImpact: number;
  maximumPayoutAda: number;
}

export interface CashOutQuote {
  grossAda: number;
  feeAda: number;
  proceedsAda: number;
  realizedPnlAda: number;
  resultingProbability: number;
}

export interface WalletSnapshot {
  connected: boolean;
  connecting: boolean;
  name: string | null;
  address: string | null;
  balanceAda: number | null;
  networkId: number | null;
}
