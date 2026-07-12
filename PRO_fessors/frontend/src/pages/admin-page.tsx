import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  FileEdit,
  Gavel,
  LoaderCircle,
  ShieldCheck,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import { ErrorState, LoadingState, PageContainer, PageHeader } from "@/components/ui";
import { BootstrapDeploymentWizard } from "@/components/bootstrap-deployment";
import { DeploymentPreflight } from "@/components/deployment-preflight";
import { useAdminDrafts } from "@/hooks/use-data";
import { submitAction } from "@/lib/actions";
import { CONFIG } from "@/lib/config";
import { formatDate, shortHash } from "@/lib/format";
import { useAppStore } from "@/store/app-store";
import type { AdminDraft, ResolutionOutcome } from "@/types";

type Tab = "DRAFTS" | "RESOLUTION";

export function AdminPage() {
  const query = useAdminDrafts();
  const [tab, setTab] = useState<Tab>("DRAFTS");
  const [selected, setSelected] = useState<AdminDraft | null>(null);

  if (query.isLoading) {
    return (
      <PageContainer className="py-20">
        <LoadingState label="Loading review queue" />
      </PageContainer>
    );
  }
  if (query.error || !query.data) {
    return (
      <PageContainer className="py-20">
        <ErrorState message={query.error?.message ?? "Admin queue unavailable."} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="py-12 sm:py-16">
      <div className="admin-banner">
        <ShieldCheck />
        <div>
          <strong>Trusted centralized role, zero custody</strong>
          <p>
            One transparent admin wallet normalizes terms and signs the outcome. It cannot spend
            user positions, withdraw LP reserves, or redirect payouts.
          </p>
        </div>
        <span>
          <UserCheck size={14} /> Demo admin wallet
        </span>
      </div>
      <div className="mt-8">
        <PageHeader
          eyebrow="Operations console"
          title="Review terms. Sign facts. Never hold funds."
          description="The hackathon MVP deliberately uses one trusted admin wallet for 1-of-1 resolution. This is centralized outcome authority, not a decentralized oracle."
        />
      </div>
      <DeploymentPreflight />
      <BootstrapDeploymentWizard />
      <div className="mt-8 flex gap-1 border-b border-line">
        <button
          className={`tab-button ${tab === "DRAFTS" ? "active" : ""}`}
          onClick={() => setTab("DRAFTS")}
        >
          Draft review <i>{query.data.filter((item) => item.status !== "APPROVED").length}</i>
        </button>
        <button
          className={`tab-button ${tab === "RESOLUTION" ? "active" : ""}`}
          onClick={() => setTab("RESOLUTION")}
        >
          Admin resolution <i>1-of-1</i>
        </button>
      </div>
      {tab === "DRAFTS" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
          <section className="overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="border-b border-line p-4">
              <span className="eyebrow">Proposal queue</span>
            </div>
            <div className="divide-y divide-line">
              {query.data.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => setSelected(draft)}
                  className={`draft-list-item ${selected?.id === draft.id ? "active" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span>{draft.id}</span>
                    <i className={`risk ${draft.risk.toLowerCase()}`}>{draft.risk} risk</i>
                  </div>
                  <strong>{draft.statement}</strong>
                  <small>
                    {draft.category} · {shortHash(draft.creator)} · submitted {formatDate(draft.submittedAt)}
                  </small>
                </button>
              ))}
            </div>
          </section>
          <ReviewPanel draft={selected ?? query.data[0]} />
        </div>
      ) : (
        <ResolutionPanel />
      )}
    </PageContainer>
  );
}

function ReviewPanel({ draft }: { draft: AdminDraft }) {
  const [pending, setPending] = useState<"approve" | "changes" | null>(null);
  const notify = useAppStore((state) => state.notify);

  async function act(action: "approve" | "changes") {
    setPending(action);
    try {
      const result = await submitAction({
        endpoint: `/market-drafts/${draft.id}/review`,
        payload: {
          action,
          normalized_statement: draft.statement,
          normalized_yes_rule: draft.yesRule,
        },
        walletName: useAppStore.getState().wallet.name,
      });
      notify({
        tone: "success",
        title: result.simulated ? `Demo review: ${action}` : `Review submitted: ${action}`,
        description:
          action === "approve"
            ? "Creator must still sign activation."
            : "Draft returned without enabling forecasts.",
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "Review failed",
        description: error instanceof Error ? error.message : "Request rejected.",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="detail-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="eyebrow">Normalize terms</span>
          <h2 className="panel-title">{draft.id}</h2>
        </div>
        <span className={`risk ${draft.risk.toLowerCase()}`}>{draft.risk} risk</span>
      </div>
      <label className="form-field mt-5">
        <span>Final statement</span>
        <textarea rows={3} defaultValue={draft.statement} />
      </label>
      <label className="form-field">
        <span>Exact YES rule</span>
        <textarea rows={5} defaultValue={draft.yesRule} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="form-field">
          <span>Primary source</span>
          <input defaultValue={draft.primarySource} />
        </label>
        <label className="form-field">
          <span>Trading deadline</span>
          <input defaultValue={formatDate(draft.tradingDeadline)} />
        </label>
      </div>
      {draft.risk === "HIGH" && (
        <div className="mb-4 flex gap-2 rounded-xl border border-coral/20 bg-coral/5 p-3 text-[10px] leading-5 text-muted">
          <AlertTriangle size={16} className="shrink-0 text-coral" />
          This proposal uses subjective language. Request objective benchmarks and an independent
          source before approval.
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="button secondary flex-1"
          onClick={() => void act("changes")}
          disabled={pending !== null}
        >
          {pending === "changes" ? <LoaderCircle className="animate-spin" /> : <FileEdit size={16} />}
          Request changes
        </button>
        <button
          type="button"
          className="button primary flex-1"
          onClick={() => void act("approve")}
          disabled={pending !== null}
        >
          {pending === "approve" ? <LoaderCircle className="animate-spin" /> : <Check size={16} />}
          Approve normalized terms
        </button>
      </div>
      <p className="mt-4 flex gap-2 text-[9px] leading-4 text-dim">
        <ShieldCheck size={13} className="shrink-0" /> Approval authorizes market activation but
        never creates a path to admin custody.
      </p>
    </section>
  );
}

function ResolutionPanel() {
  const [choice, setChoice] = useState<ResolutionOutcome>("YES");
  const [signedOutcome, setSignedOutcome] = useState<ResolutionOutcome | null>(null);
  const [pending, setPending] = useState(false);
  const notify = useAppStore((state) => state.notify);

  async function signResolution() {
    if (signedOutcome) return;
    setPending(true);
    try {
      const result = await submitAction({
        endpoint: "/markets/demo-closed/resolution-payload",
        payload: {
          outcome: choice,
          evidence_uri: "https://primary-source.example/result",
          admin_payment_credential: CONFIG.adminPaymentCredential,
        },
        walletName: useAppStore.getState().wallet.name,
      });
      setSignedOutcome(choice);
      notify({
        tone: "success",
        title: result.simulated ? "Demo admin outcome signed" : "Admin resolution signed",
        description: `${choice} · 1/1 admin signature. The admin did not receive custody.`,
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "Admin signature failed",
        description: error instanceof Error ? error.message : "Signature rejected.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_370px]">
      <section className="detail-card p-5 sm:p-6">
        <div className="flex justify-between">
          <div>
            <span className="eyebrow">Trusted centralized resolution</span>
            <h2 className="panel-title">
              Did Project Atlas launch its public beta before 30 June?
            </h2>
          </div>
          <Gavel className="text-amber" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="term-box">
            <span>YES condition</span>
            <p>
              The vendor&apos;s official product page permits public account creation before the
              deadline.
            </p>
          </div>
          <div className="term-box">
            <span>Evidence source</span>
            <p>Official product changelog and timestamped release announcement.</p>
          </div>
        </div>
        <label className="form-field mt-5">
          <span>Evidence URL</span>
          <input defaultValue="https://primary-source.example/result" disabled={Boolean(signedOutcome)} />
        </label>
        <div className="resolution-choice">
          <button
            className={choice === "YES" ? "yes active" : "yes"}
            onClick={() => setChoice("YES")}
            disabled={Boolean(signedOutcome)}
          >
            <CheckCircle2 /> YES
          </button>
          <button
            className={choice === "NO" ? "no active" : "no"}
            onClick={() => setChoice("NO")}
            disabled={Boolean(signedOutcome)}
          >
            <XCircle /> NO
          </button>
          <button
            className={choice === "VOID" ? "void active" : "void"}
            onClick={() => setChoice("VOID")}
            disabled={Boolean(signedOutcome)}
          >
            <AlertTriangle /> VOID
          </button>
        </div>
        <button
          className="button primary w-full"
          onClick={() => void signResolution()}
          disabled={pending || Boolean(signedOutcome)}
        >
          {pending ? (
            <>
              <LoaderCircle className="animate-spin" /> Signing outcome
            </>
          ) : signedOutcome ? (
            <>
              <CheckCircle2 size={16} /> {signedOutcome} signed · 1-of-1
            </>
          ) : (
            <>
              <Gavel size={16} /> Sign {choice} as admin
            </>
          )}
        </button>
      </section>
      <aside className="space-y-3">
        <div className="detail-card p-5">
          <span className="eyebrow">Resolution authority</span>
          <h2 className="panel-title">{signedOutcome ? "1/1" : "0/1"} signature</h2>
          <div className="mt-5">
            <div className="authority-row">
              <span>
                {signedOutcome ? (
                  <CheckCircle2 className="text-teal" />
                ) : (
                  <Clock3 className="text-dim" />
                )}
              </span>
              <div>
                <strong>Admin resolution wallet</strong>
                <small>key_admin_{shortHash(CONFIG.adminPaymentCredential)}</small>
              </div>
              <i>{signedOutcome ?? "PENDING"}</i>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-amber/20 bg-amber/5 p-3 text-[9px] leading-4 text-dim">
            <AlertTriangle size={14} className="mb-2 text-amber" /> This is a trusted, centralized
            outcome decision. The admin signs the result and evidence only; it cannot withdraw the
            pool, cash out a user position, or redirect terminal payouts.
          </div>
        </div>
        <div className="detail-card p-4 text-[9px] leading-4 text-dim">
          <ShieldCheck size={14} className="mb-2 text-blue" /> A production upgrade should add
          category-specific data oracles, a dispute window, and multi-party quorum governance.
        </div>
      </aside>
    </div>
  );
}
