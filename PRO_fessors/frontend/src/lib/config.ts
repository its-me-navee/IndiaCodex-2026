const configuredCollateral = Number(
  (import.meta.env.VITE_DEPLOYMENT_MIN_COLLATERAL_LOVELACE as string | undefined) ?? "5000000",
);

export const CONFIG = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "",
  wsUrl: (import.meta.env.VITE_WS_URL as string | undefined)?.replace(/\/$/, "") ?? "",
  network: (import.meta.env.VITE_NETWORK as string | undefined) ?? "preprod",
  blockfrostProjectId: (import.meta.env.VITE_BLOCKFROST_PROJECT_ID as string | undefined) ?? "",
  explorerUrl:
    (import.meta.env.VITE_EXPLORER_URL as string | undefined)?.replace(/\/$/, "") ??
    "https://preprod.cardanoscan.io",
  marketLifecycleScriptAddress:
    (import.meta.env.VITE_MARKET_LIFECYCLE_SCRIPT_ADDRESS as string | undefined) ?? "",
  marketScriptAddress: (import.meta.env.VITE_MARKET_SCRIPT_ADDRESS as string | undefined) ?? "",
  marketSettlementScriptAddress:
    (import.meta.env.VITE_MARKET_SETTLEMENT_SCRIPT_ADDRESS as string | undefined) ?? "",
  liquidityScriptAddress:
    (import.meta.env.VITE_LIQUIDITY_SCRIPT_ADDRESS as string | undefined) ?? "",
  positionScriptAddress:
    (import.meta.env.VITE_POSITION_SCRIPT_ADDRESS as string | undefined) ?? "",
  adminPaymentCredential:
    (import.meta.env.VITE_ADMIN_PAYMENT_CREDENTIAL as string | undefined)?.toLowerCase().trim() ?? "",
  deploymentMinCollateralLovelace:
    Number.isFinite(configuredCollateral) && configuredCollateral > 0
      ? Math.floor(configuredCollateral)
      : 5_000_000,
  demoFallback:
    ((import.meta.env.VITE_DEMO_FALLBACK as string | undefined) ?? "true") !== "false",
  networkId: 0,
  liquidityFeeBps: 100,
  openingForecastTarget: 100,
} as const;

export const isApiConfigured = Boolean(CONFIG.apiUrl);
