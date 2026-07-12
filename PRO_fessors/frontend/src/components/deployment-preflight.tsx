import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  LoaderCircle,
  Network,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useDeploymentStatus } from "@/hooks/use-data";
import { CONFIG } from "@/lib/config";
import { formatAda, lovelaceToAda, shortHash } from "@/lib/format";
import {
  inspectDeploymentWallet,
  type DeploymentPreflightResult,
} from "@/lib/wallet";
import { useAppStore } from "@/store/app-store";
import { DEPLOYMENT_SCRIPT_NAMES } from "@/types";
import type {
  DeploymentObservationStatus,
  DeploymentScriptName,
  DeploymentScriptStatus,
} from "@/types";

type PreflightView =
  | { status: "DISCONNECTED"; title: string; detail: string; result?: undefined }
  | { status: "CHECKING"; title: string; detail: string; result?: undefined }
  | { status: "ERROR"; title: string; detail: string; result?: undefined }
  | (DeploymentPreflightResult & { result: DeploymentPreflightResult });

const statusStyle: Record<PreflightView["status"], string> = {
  READY: "border-teal/30 bg-teal/8 text-teal",
  NEEDS_COLLATERAL: "border-amber/30 bg-amber/8 text-amber",
  NEEDS_SPENDABLE: "border-amber/30 bg-amber/8 text-amber",
  WRONG_WALLET: "border-coral/30 bg-coral/8 text-coral",
  WRONG_NETWORK: "border-coral/30 bg-coral/8 text-coral",
  CONFIG_REQUIRED: "border-amber/30 bg-amber/8 text-amber",
  DISCONNECTED: "border-line bg-void text-dim",
  CHECKING: "border-blue/30 bg-blue/8 text-blue",
  ERROR: "border-coral/30 bg-coral/8 text-coral",
};

const scriptLabels: Record<DeploymentScriptName, string> = {
  market_lifecycle: "Market lifecycle validator",
  market: "Market trading validator",
  market_settlement: "Market settlement validator",
  liquidity: "Liquidity validator",
  position: "Position validator",
};

const observationStyle: Record<DeploymentObservationStatus, string> = {
  NOT_CONFIGURED: "border-line bg-white/3 text-dim",
  OBSERVED: "border-blue/25 bg-blue/8 text-blue",
  NOT_OBSERVED: "border-amber/25 bg-amber/8 text-amber",
  UNKNOWN: "border-line bg-void text-muted",
};

export function DeploymentPreflight() {
  const wallet = useAppStore((state) => state.wallet);
  const deploymentQuery = useDeploymentStatus();
  const [view, setView] = useState<PreflightView>({
    status: "DISCONNECTED",
    title: "Connect the deployment admin wallet",
    detail: "Preflight reads wallet state only after a CIP-30 connection is approved.",
  });

  const inspect = useCallback(async () => {
    if (!wallet.connected || !wallet.name) {
      setView({
        status: "DISCONNECTED",
        title: "Connect the deployment admin wallet",
        detail: "Preflight reads wallet state only after a CIP-30 connection is approved.",
      });
      return;
    }
    setView({
      status: "CHECKING",
      title: "Inspecting wallet",
      detail: "Reading network, change address, spendable UTxOs, and collateral through CIP-30.",
    });
    try {
      const result = await inspectDeploymentWallet(wallet.name);
      setView({ ...result, result });
    } catch (error) {
      setView({
        status: "ERROR",
        title: "Preflight unavailable",
        detail: error instanceof Error ? error.message : "The wallet inspection failed.",
      });
    }
  }, [wallet.connected, wallet.name]);

  useEffect(() => {
    void inspect();
  }, [inspect, wallet.address]);

  const snapshot = view.result?.snapshot;
  const deployment = deploymentQuery.data;
  const scriptStatuses: DeploymentScriptStatus[] =
    deployment?.scripts ??
    DEPLOYMENT_SCRIPT_NAMES.map((script) => ({
      script,
      address: null,
      configured: null,
      observationStatus: "UNKNOWN",
      observed: null,
      detail: deploymentQuery.isLoading
        ? "Waiting for the backend deployment-status response."
        : "Backend deployment status is unavailable; chain observation is unknown.",
    }));
  const StatusIcon =
    view.status === "READY"
      ? CheckCircle2
      : view.status === "CHECKING"
        ? LoaderCircle
        : view.status === "DISCONNECTED"
          ? WalletCards
          : view.status === "NEEDS_COLLATERAL" ||
              view.status === "NEEDS_SPENDABLE" ||
              view.status === "CONFIG_REQUIRED"
            ? AlertTriangle
            : ShieldAlert;

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-line bg-panel" aria-live="polite">
      <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="eyebrow">Deployment preflight · read only</span>
          <h2 className="panel-title">Admin wallet readiness</h2>
          <p className="mt-1 max-w-2xl text-[10px] leading-5 text-dim">
            Inspects CIP-30 network, change address, UTxOs, and collateral. It never requests or
            exposes wallet keys, signs a transaction, or submits anything on-chain.
          </p>
        </div>
        <button
          type="button"
          className="button secondary shrink-0"
          onClick={() => void inspect()}
          disabled={!wallet.connected || view.status === "CHECKING"}
        >
          {view.status === "CHECKING" ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          Run preflight
        </button>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[1.2fr_.8fr]">
        <div>
          <div className={`flex gap-3 rounded-xl border p-4 ${statusStyle[view.status]}`}>
            <StatusIcon
              size={20}
              className={view.status === "CHECKING" ? "shrink-0 animate-spin" : "shrink-0"}
            />
            <div>
              <strong className="text-xs font-black tracking-wide">{view.status}</strong>
              <h3 className="mt-0.5 font-display text-xl font-semibold text-ink">{view.title}</h3>
              <p className="mt-1 text-[10px] leading-5 text-muted">{view.detail}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <PreflightMetric
              icon={<Network />}
              label="Network"
              value={
                snapshot
                  ? `${snapshot.networkId === 0 ? "testnet" : "mainnet"} · ${snapshot.networkId}`
                  : "—"
              }
              detail={`Expected ${CONFIG.network} testnet · ${CONFIG.networkId}; CIP-30 reports testnet class`}
            />
            <PreflightMetric
              icon={<WalletCards />}
              label="Payment credential"
              value={
                snapshot?.paymentCredential
                  ? shortHash(snapshot.paymentCredential, 10, 8)
                  : "—"
              }
              detail={
                CONFIG.adminPaymentCredential
                  ? `Expected ${shortHash(CONFIG.adminPaymentCredential, 10, 8)}`
                  : "VITE_ADMIN_PAYMENT_CREDENTIAL is not set"
              }
            />
            <PreflightMetric
              icon={<Coins />}
              label="Spendable UTxOs"
              value={
                snapshot
                  ? `${snapshot.utxoCount} · ${formatAda(lovelaceToAda(snapshot.totalUtxoLovelace), 2)} tADA`
                  : "—"
              }
              detail="Read from CIP-30; transaction inputs are not selected yet"
            />
            <PreflightMetric
              icon={<ShieldAlert />}
              label="Collateral"
              value={
                snapshot
                  ? `${snapshot.collateralCount} · ${formatAda(lovelaceToAda(snapshot.collateralLovelace), 2)} tADA`
                  : "—"
              }
              detail={`Minimum ${formatAda(CONFIG.deploymentMinCollateralLovelace / 1_000_000, 2)} tADA`}
            />
          </div>
        </div>

        <aside className="rounded-xl border border-line bg-void p-4">
          <span className="eyebrow">Change address</span>
          <p className="mt-3 break-all font-mono text-[9px] leading-5 text-muted">
            {snapshot?.changeAddress ?? "Connect a wallet to inspect its CIP-30 change address."}
          </p>
          <div className="mt-4 border-t border-line pt-4 text-[9px] leading-5 text-dim">
            <strong className="block text-amber">Readiness does not deploy</strong>
            The bootstrap wizard below independently rechecks the live seed, collateral,
            configured contract graph, datums, evaluation, and transaction size before it exposes
            a separate user-initiated Lace signing action.
          </div>
        </aside>
      </div>

      <div className="border-t border-line p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="eyebrow">Backend address observation</span>
            <h3 className="panel-title">Configured script addresses</h3>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-dim">
              Reports address configuration and Blockfrost transaction-history observation only.
              It does not verify validator bytes, parameters, behavior, or deployment correctness.
            </p>
          </div>
          <button
            type="button"
            className="button secondary shrink-0"
            onClick={() => void deploymentQuery.refetch()}
            disabled={deploymentQuery.isFetching}
          >
            {deploymentQuery.isFetching ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Refresh status
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {scriptStatuses.map((item) => (
            <div className="rounded-xl border border-line bg-void p-4" key={item.script}>
              <div className="flex items-center justify-between gap-3">
                <strong className="text-[10px] font-black uppercase tracking-[.1em]">
                  {scriptLabels[item.script]}
                </strong>
                <span
                  className={`rounded-full border px-2 py-1 text-[7px] font-black tracking-[.09em] ${observationStyle[item.observationStatus]}`}
                >
                  {item.observationStatus}
                </span>
              </div>
              <p className="mt-3 break-all font-mono text-[8px] leading-4 text-muted">
                {item.address ??
                  (item.observationStatus === "NOT_CONFIGURED"
                    ? "No address configured"
                    : "Address unavailable")}
              </p>
              <small className="mt-2 block text-[8px] leading-4 text-dim">{item.detail}</small>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-3 rounded-xl border border-blue/20 bg-blue/5 p-4 text-blue">
          <RadioTower size={18} className="shrink-0" />
          <div>
            <strong className="block text-[10px] font-black uppercase tracking-[.1em]">
              Observation is not deployment verification
            </strong>
            <p className="mt-1 text-[9px] leading-5 text-muted">
              {deployment?.caveat ??
                (deploymentQuery.error instanceof Error
                  ? `${deploymentQuery.error.message} No address observation can be asserted.`
                  : "Waiting for the backend caveat; no address observation is being asserted.")}
            </p>
            <small className="mt-1 block text-[8px] text-dim">
              {deployment?.source === "api"
                ? `Backend ${deployment.network} · Blockfrost queries ${deployment.blockfrostQueryConfigured ? "configured" : "not configured"}`
                : deployment?.source === "demo"
                  ? "Demo fallback · all observations remain UNKNOWN"
                  : "Backend status pending"}
            </small>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreflightMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-line bg-void p-3">
      <span className="mt-0.5 text-blue [&>svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <span className="text-[8px] font-black uppercase tracking-[.13em] text-dim">{label}</span>
        <strong className="mt-1 block truncate text-[11px]">{value}</strong>
        <small className="mt-1 block text-[8px] leading-4 text-dim">{detail}</small>
      </div>
    </div>
  );
}
