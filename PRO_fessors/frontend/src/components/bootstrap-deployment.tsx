import {
  AlertTriangle,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  Rocket,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import {
  BOOTSTRAP_DEMO_MARKET,
  BOOTSTRAP_TOTAL_COLLATERAL_LOVELACE,
  BootstrapPreparationError,
  bootstrapConfigurationIssues,
  lovelaceIn,
  prepareBootstrapDeployment,
  signAndSubmitBootstrap,
  utxoReference,
  type BootstrapErrorCode,
  type BootstrapPreparedReview,
} from "@/lib/bootstrap-deployment";
import { CONFIG } from "@/lib/config";
import { formatAda, shortHash } from "@/lib/format";
import { useAppStore } from "@/store/app-store";

type WizardState =
  | { phase: "IDLE" }
  | { phase: "PREPARING" }
  | { phase: "PREPARED_UNSIGNED"; review: BootstrapPreparedReview }
  | { phase: "SIGNING"; review: BootstrapPreparedReview }
  | {
      phase: "ERROR";
      code: BootstrapErrorCode;
      message: string;
      review?: BootstrapPreparedReview;
    }
  | {
      phase: "SUBMITTED_UNCONFIRMED";
      review: BootstrapPreparedReview;
      txHash: string;
    };

const scriptLabels = {
  lifecycle: "Lifecycle",
  trading: "Trading",
  settlement: "Settlement",
  liquidity: "Liquidity",
  position: "Position",
} as const;

export function BootstrapDeploymentWizard() {
  const wallet = useAppStore((state) => state.wallet);
  const notify = useAppStore((state) => state.notify);
  const [state, setState] = useState<WizardState>({ phase: "IDLE" });
  const configurationIssues = bootstrapConfigurationIssues();
  const laceConnected = wallet.connected && wallet.name?.toLowerCase() === "lace";
  const review = "review" in state ? state.review : undefined;

  async function prepare() {
    if (!laceConnected || !wallet.name || configurationIssues.length > 0) return;
    setState({ phase: "PREPARING" });
    try {
      const prepared = await prepareBootstrapDeployment(wallet.name);
      setState({ phase: "PREPARED_UNSIGNED", review: prepared });
    } catch (error) {
      setState({
        phase: "ERROR",
        code: error instanceof BootstrapPreparationError ? error.code : "BUILD_FAILED",
        message: error instanceof Error ? error.message : "Bootstrap preparation failed.",
      });
    }
  }

  async function signAndSubmit() {
    if (!review || !wallet.name || !laceConnected) return;
    setState({ phase: "SIGNING", review });
    try {
      const txHash = await signAndSubmitBootstrap(wallet.name, review);
      setState({ phase: "SUBMITTED_UNCONFIRMED", review, txHash });
      notify({
        tone: "success",
        title: "Bootstrap submitted — unconfirmed",
        description: "Lace returned a transaction hash. Wait for independent chain observation.",
        txHash,
      });
    } catch (error) {
      setState({
        phase: "ERROR",
        code: error instanceof BootstrapPreparationError ? error.code : "SIGNING_FAILED",
        message: error instanceof Error ? error.message : "Lace signing or submission failed.",
        review,
      });
    }
  }

  const preparing = state.phase === "PREPARING";
  const signing = state.phase === "SIGNING";
  const submitted = state.phase === "SUBMITTED_UNCONFIRMED";

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="eyebrow">One-shot bootstrap · Lace</span>
          <h2 className="panel-title">Prepare, review, then explicitly sign</h2>
          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-dim">
            Preparation derives the live contract graph, revalidates seed and collateral through
            preprod Blockfrost, evaluates an unsigned transaction, and stops. It never signs or
            submits until the separate Lace action is clicked.
          </p>
        </div>
        <span className="status-badge muted">
          <i /> {state.phase}
        </span>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[.8fr_1.2fr]">
        <div>
          <div className="rounded-xl border border-line bg-void p-4">
            <span className="eyebrow">Phase 1</span>
            <h3 className="mt-1 font-display text-lg font-semibold">Prepare unsigned transaction</h3>
            <p className="mt-2 text-[9px] leading-5 text-dim">
              Lace supplies public CIP-30 UTxOs only. The largest pure-ADA admin UTxO outside the
              collateral set becomes the one-shot seed. A stale configured graph fails as
              CONFIG_MISMATCH before transaction construction.
            </p>

            {configurationIssues.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber/20 bg-amber/5 p-3 text-[8px] leading-4 text-amber">
                <strong className="block">CONFIG_REQUIRED</strong>
                {configurationIssues.map((issue) => (
                  <span className="mt-1 block" key={issue}>• {issue}</span>
                ))}
              </div>
            )}
            {!laceConnected && (
              <div className="mt-3 rounded-lg border border-amber/20 bg-amber/5 p-3 text-[8px] leading-4 text-amber">
                Connect Lace on Cardano preprod/testnet to enable preparation.
              </div>
            )}
            {state.phase === "ERROR" && (
              <div className="mt-3 rounded-lg border border-coral/25 bg-coral/5 p-3 text-[8px] leading-4 text-coral">
                <strong className="block">{state.code}</strong>
                <span className="mt-1 block text-muted">{state.message}</span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="button secondary"
                onClick={() => void prepare()}
                disabled={
                  !laceConnected ||
                  configurationIssues.length > 0 ||
                  state.phase !== "IDLE"
                }
              >
                {preparing ? <LoaderCircle className="animate-spin" /> : <FileCheck2 size={15} />}
                {preparing ? "Preparing & evaluating" : "Prepare & review unsigned tx"}
              </button>
              {state.phase === "ERROR" && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setState({ phase: "IDLE" })}
                >
                  Reset checks
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-line bg-void p-4">
            <span className="eyebrow">Phase 2</span>
            <h3 className="mt-1 font-display text-lg font-semibold">Sign & submit in Lace</h3>
            <p className="mt-2 text-[9px] leading-5 text-dim">
              This is the only signing action. Lace shows the transaction for user approval,
              merges its witness into the full CBOR, and submits it. No key leaves Lace.
            </p>
            <button
              type="button"
              className="button primary mt-4 w-full"
              onClick={() => void signAndSubmit()}
              disabled={state.phase !== "PREPARED_UNSIGNED" || !laceConnected}
            >
              {signing ? <LoaderCircle className="animate-spin" /> : <Send size={15} />}
              {signing ? "Waiting for Lace" : "Sign & submit in Lace"}
            </button>
            <small className="mt-3 flex gap-2 text-[8px] leading-4 text-dim">
              <ShieldCheck size={13} className="shrink-0 text-teal" /> No automatic signature,
              background submission, private key, seed phrase, or local signing key.
            </small>
          </div>
        </div>

        <div>
          {!review ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-void p-8 text-center">
              <Rocket className="text-dim" />
              <strong className="mt-3 text-sm">No unsigned transaction prepared</strong>
              <p className="mt-2 max-w-md text-[9px] leading-5 text-dim">
                Preparation must pass network, admin credential, live seed, dedicated collateral,
                five derived-address, datum, evaluation, and serialized-size gates.
              </p>
            </div>
          ) : (
            <ReviewPanel review={review} />
          )}

          {submitted && (
            <div className="mt-3 rounded-xl border border-blue/25 bg-blue/5 p-4">
              <div className="flex gap-3">
                <AlertTriangle size={18} className="shrink-0 text-blue" />
                <div>
                  <strong className="text-xs text-blue">SUBMITTED_UNCONFIRMED</strong>
                  <p className="mt-1 text-[9px] leading-5 text-muted">
                    Lace accepted the submission, but this UI does not claim inclusion or validator
                    correctness. Verify the transaction and state outputs independently.
                  </p>
                  <a
                    className="mt-2 inline-flex items-center gap-1 font-mono text-[9px] text-blue"
                    href={`${CONFIG.explorerUrl}/transaction/${state.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {state.txHash} <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewPanel({ review }: { review: BootstrapPreparedReview }) {
  return (
    <div className="rounded-xl border border-teal/20 bg-teal/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Unsigned review</span>
          <h3 className="mt-1 font-display text-xl font-semibold">PREPARED_UNSIGNED</h3>
        </div>
        <ShieldCheck className="text-teal" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <ReviewValue label="Seed" value={utxoReference(review.seed)} />
        <ReviewValue label="Seed value" value={`${formatAda(Number(lovelaceIn(review.seed)) / 1_000_000, 2)} tADA`} />
        <ReviewValue label="Dedicated collateral" value={utxoReference(review.collateral)} />
        <ReviewValue label="State policy" value={review.graph.statePolicy.policyId} />
        <ReviewValue label="Unsigned body hash" value={review.unsignedTxHash} />
        <ReviewValue label="Serialized size" value={`${review.unsignedTxBytes.toLocaleString()} bytes`} />
        <ReviewValue label="Expires after slot" value={review.invalidHereafterSlot.toLocaleString()} />
        <ReviewValue
          label="Script-failure collateral cap"
          value={`${formatAda(Number(BOOTSTRAP_TOTAL_COLLATERAL_LOVELACE) / 1_000_000, 2)} tADA`}
        />
      </div>

      <div className="mt-4 rounded-lg border border-line bg-void p-3">
        <strong className="text-[9px] uppercase tracking-[.1em]">
          Immutable disposable demo market
        </strong>
        <p className="mt-2 text-[9px] font-semibold leading-5 text-ink">
          {BOOTSTRAP_DEMO_MARKET.statement}
        </p>
        <p className="mt-1 text-[8px] leading-4 text-muted">
          Market {BOOTSTRAP_DEMO_MARKET.marketId} · trading closes{" "}
          {new Date(BOOTSTRAP_DEMO_MARKET.tradingDeadlineMs).toISOString()} · resolution window
          ends {new Date(BOOTSTRAP_DEMO_MARKET.resolutionDeadlineMs).toISOString()} · claims end{" "}
          {new Date(BOOTSTRAP_DEMO_MARKET.claimDeadlineMs).toISOString()}
        </p>
        <p className="mt-1 text-[8px] leading-4 text-dim">
          Source: {BOOTSTRAP_DEMO_MARKET.source}. One disclosed admin resolves YES/NO; anyone may
          trigger VOID after the resolution deadline.
        </p>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-void p-3">
        <strong className="text-[9px] uppercase tracking-[.1em]">Exact mint & outputs</strong>
        <p className="mt-2 text-[8px] leading-4 text-muted">
          1 × MARKET_STATE → lifecycle · 3.00 tADA · PendingActivation inline datum
        </p>
        <p className="text-[8px] leading-4 text-muted">
          1 × LIQUIDITY_STATE → liquidity · 3.00 tADA · empty reserve inline datum
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {(Object.keys(scriptLabels) as Array<keyof typeof scriptLabels>).map((key) => (
          <div className="rounded-lg border border-line bg-void px-3 py-2" key={key}>
            <div className="flex items-center justify-between gap-3">
              <strong className="text-[8px] uppercase tracking-[.1em]">{scriptLabels[key]}</strong>
              <span className="font-mono text-[8px] text-dim">
                {shortHash(review.graph.scripts[key].hash, 9, 7)}
              </span>
            </div>
            <p className="mt-1 break-all font-mono text-[7px] leading-4 text-muted">
              {review.graph.scripts[key].address}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 flex gap-2 text-[8px] leading-4 text-amber">
        <AlertTriangle size={13} className="shrink-0" /> Signing consumes the displayed seed and
        permanently fixes this one-shot policy. PREPARED_UNSIGNED is not submitted or confirmed.
      </p>
    </div>
  );
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-void p-3">
      <span className="text-[7px] font-black uppercase tracking-[.1em] text-dim">{label}</span>
      <strong className="mt-1 block break-all font-mono text-[8px] leading-4">{value}</strong>
    </div>
  );
}
