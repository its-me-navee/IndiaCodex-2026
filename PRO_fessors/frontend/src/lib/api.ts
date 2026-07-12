import { CONFIG } from "@/lib/config";
import { lovelaceToAda } from "@/lib/format";
import { DEPLOYMENT_SCRIPT_NAMES } from "@/types";
import type {
  AdminDraft,
  DeploymentObservationStatus,
  DeploymentScriptName,
  DeploymentStatus,
  LeaderboardEntry,
  LiquidityState,
  Market,
  MarketStatus,
  Portfolio,
  SimulationStatus,
} from "@/types";

interface ApiMarket {
  id: string;
  statement: string;
  category: string;
  status: string;
  opening_forecast_count: number;
  opening_yes_count?: number;
  opening_no_count?: number;
  yes_probability: number | null;
  liquidity_lovelace: number | string;
  volume_lovelace: number | string;
  trading_deadline: string;
  resolution_deadline: string;
  [key: string]: unknown;
}

interface ApiScriptDeploymentStatus {
  script: DeploymentScriptName;
  address: string | null;
  configured: boolean;
  observation_status: string;
  observed: boolean | null;
  detail: string;
}

interface ApiDeploymentStatus {
  network: string;
  admin_payment_credential: string;
  blockfrost_query_configured: boolean;
  scripts: ApiScriptDeploymentStatus[];
  checked_at: string;
  caveat: string;
}

const observationStatuses: DeploymentObservationStatus[] = [
  "NOT_CONFIGURED",
  "OBSERVED",
  "NOT_OBSERVED",
  "UNKNOWN",
];

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!CONFIG.apiUrl) throw new ApiError("VITE_API_URL is not configured.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`${CONFIG.apiUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!response.ok) throw new ApiError(`API request failed (${response.status}).`, response.status);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("API request timed out.");
    }
    throw new ApiError(error instanceof Error ? error.message : "API request failed.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function status(value: string): MarketStatus {
  const normalized = value.toUpperCase().replaceAll("-", "_");
  if (normalized === "VOIDED") return "VOID";
  const allowed: MarketStatus[] = ["DRAFT", "PRICE_DISCOVERY", "FUNDING", "TRADING", "CLOSED", "RESOLVED", "VOID"];
  return allowed.includes(normalized as MarketStatus) ? (normalized as MarketStatus) : "DRAFT";
}

function probability(value: number | null): number | null {
  if (value == null) return null;
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value / 100 : value;
}

export function normalizeMarket(raw: ApiMarket): Market {
  const marketStatus = status(raw.status);
  const forecastCount = Math.min(100, Math.max(0, Number(raw.opening_forecast_count ?? 0)));
  const yesCount = Number(raw.opening_yes_count ?? Math.round(forecastCount * (probability(raw.yes_probability) ?? 0.5)));
  const yesProbability = marketStatus === "PRICE_DISCOVERY" || forecastCount < 100
    ? null
    : probability(raw.yes_probability);
  const liquidityAda = lovelaceToAda(raw.liquidity_lovelace);
  const volumeAda = lovelaceToAda(raw.volume_lovelace);
  const extra = raw as Record<string, unknown>;
  return {
    id: raw.id,
    statement: raw.statement,
    description: String(extra.description ?? "Objective statement market secured by a market-specific Cardano state UTxO."),
    category: raw.category,
    status: marketStatus,
    yesProbability,
    openingForecast: {
      count: forecastCount,
      yesCount,
      noCount: Number(raw.opening_no_count ?? forecastCount - yesCount),
      target: 100,
      pollRoot: typeof extra.opening_poll_root === "string" ? extra.opening_poll_root : null,
      simulated: Boolean(extra.simulation),
      confirmedBy: Number(extra.opening_confirmations ?? 0),
    },
    liquidityAda,
    minimumLiquidityAda: lovelaceToAda(extra.minimum_liquidity_lovelace as number | string | undefined) || 100,
    volumeAda,
    predictionPoolAda: lovelaceToAda(extra.user_collateral_lovelace as number | string | undefined),
    availableLiquidityAda: lovelaceToAda(extra.available_liquidity_lovelace as number | string | undefined) || liquidityAda,
    yesLiabilityAda: lovelaceToAda(extra.yes_liability_lovelace as number | string | undefined),
    noLiabilityAda: lovelaceToAda(extra.no_liability_lovelace as number | string | undefined),
    liquidityFeeBps: 100,
    tradingDeadline: raw.trading_deadline,
    resolutionDeadline: raw.resolution_deadline,
    yesRule: String(extra.yes_rule ?? extra.resolution_criteria ?? "See the immutable market resolution criteria."),
    primarySource: String(extra.primary_source ?? "Published primary resolution source"),
    backupSource: String(extra.backup_source ?? "Published backup resolution source"),
    invalidRule: String(extra.invalid_rule ?? "VOID if objective resolution is impossible by the resolution deadline."),
    creator: String(extra.creator ?? extra.creator_pkh ?? "unknown"),
    resolutionOutcome: (extra.resolution_outcome as Market["resolutionOutcome"]) ?? null,
    simulation: Boolean(extra.simulation),
    featured: extra.featured == null ? marketStatus === "TRADING" : Boolean(extra.featured),
    chart: Array.isArray(extra.chart) ? (extra.chart as Market["chart"]) : [],
    activity: Array.isArray(extra.activity) ? (extra.activity as Market["activity"]) : [],
  };
}

function unwrapList<T>(value: T[] | { items: T[] }): T[] {
  return Array.isArray(value) ? value : value.items;
}

export async function apiHealth(): Promise<{ status: string }> {
  return request("/health");
}

export async function apiMarkets(): Promise<Market[]> {
  const raw = await request<ApiMarket[] | { items: ApiMarket[] }>("/markets");
  return unwrapList(raw).map(normalizeMarket);
}

export async function apiMarket(id: string): Promise<Market> {
  return normalizeMarket(await request<ApiMarket>(`/markets/${encodeURIComponent(id)}`));
}

export async function apiLiquidity(id: string): Promise<LiquidityState> {
  return request(`/markets/${encodeURIComponent(id)}/liquidity`);
}

export async function apiPortfolio(): Promise<Portfolio> {
  return request("/portfolio");
}

export async function apiLeaderboard(): Promise<LeaderboardEntry[]> {
  const result = await request<LeaderboardEntry[] | { items: LeaderboardEntry[] }>("/leaderboard");
  return unwrapList(result);
}

export async function apiSimulation(): Promise<SimulationStatus> {
  return request("/simulation/status");
}

export function normalizeDeploymentStatus(raw: ApiDeploymentStatus): DeploymentStatus {
  if (raw.network !== "preprod") {
    throw new ApiError(`Deployment status reported unsupported network: ${raw.network}.`);
  }
  return {
    network: "preprod",
    adminPaymentCredential: raw.admin_payment_credential,
    blockfrostQueryConfigured: raw.blockfrost_query_configured,
    scripts: DEPLOYMENT_SCRIPT_NAMES.map((script) => {
      const item = raw.scripts.find((candidate) => candidate.script === script);
      if (!item) {
        return {
          script,
          address: null,
          configured: null,
          observationStatus: "UNKNOWN",
          observed: null,
          detail: "The backend response omitted this script; chain observation is unknown.",
        };
      }
      return {
        script,
        address: item.address,
        configured: item.configured,
        observationStatus: observationStatuses.includes(
          item.observation_status as DeploymentObservationStatus,
        )
          ? (item.observation_status as DeploymentObservationStatus)
          : "UNKNOWN",
        observed: item.observed,
        detail: item.detail,
      };
    }),
    checkedAt: raw.checked_at,
    caveat: raw.caveat,
    source: "api",
  };
}

export async function apiDeploymentStatus(): Promise<DeploymentStatus> {
  return normalizeDeploymentStatus(await request<ApiDeploymentStatus>("/deployment/status"));
}

export async function apiDrafts(): Promise<AdminDraft[]> {
  const result = await request<AdminDraft[] | { items: AdminDraft[] }>("/market-drafts");
  return unwrapList(result);
}

export interface ActionResponse {
  unsigned_tx?: string;
  tx_hash?: string;
  transaction_id?: string;
  status?: string;
  [key: string]: unknown;
}

export function apiAction(path: string, body: unknown): Promise<ActionResponse> {
  return request(path, { method: "POST", body: JSON.stringify(body) });
}
