import { ArrowRight, BarChart3, Droplets, ExternalLink, Info, LoaderCircle, RotateCcw, WalletCards } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ErrorState, LoadingState, Metric, PageContainer, PageHeader } from "@/components/ui";
import { usePortfolio } from "@/hooks/use-data";
import { submitAction } from "@/lib/actions";
import { formatAda, formatPercent, shortHash } from "@/lib/format";
import { buildCashOutQuote } from "@/lib/market-math";
import { useAppStore } from "@/store/app-store";
import type { Position } from "@/types";

type Tab = "OPEN" | "HISTORY" | "LIQUIDITY";

export function PortfolioPage() {
  const query = usePortfolio();
  const [tab, setTab] = useState<Tab>("OPEN");
  const wallet = useAppStore((state) => state.wallet);
  if (query.isLoading) return <PageContainer className="py-20"><LoadingState label="Indexing wallet positions" /></PageContainer>;
  if (query.error || !query.data) return <PageContainer className="py-20"><ErrorState message={query.error?.message ?? "Portfolio unavailable."} retry={() => void query.refetch()} /></PageContainer>;
  const portfolio = query.data;
  const open = portfolio.positions.filter((item) => item.status === "OPEN");
  const history = portfolio.positions.filter((item) => item.status !== "OPEN");
  return (
    <PageContainer className="py-12 sm:py-16">
      <PageHeader eyebrow="Wallet exposure" title="Your on-chain positions." description="Estimated value is a mark-to-market projection, not wallet balance, until a full cash-out or redemption confirms." actions={<span className="rounded-xl border border-line bg-panel px-3 py-2 font-mono text-[10px] text-muted"><WalletCards size={14} className="mr-2 inline text-lime" />{shortHash(wallet.address ?? portfolio.wallet)}</span>} />
      <div className="mt-8 grid grid-cols-2 gap-2 lg:grid-cols-5"><Metric label="Available wallet" value={`${formatAda(portfolio.availableAda)} ₳`} /><Metric label="Committed" value={`${formatAda(portfolio.committedAda)} ₳`} /><Metric label="Estimated value" value={`${formatAda(portfolio.estimatedValueAda)} ₳`} tone="lime" /><Metric label="Unrealized P/L" value={`${portfolio.unrealizedPnlAda >= 0 ? "+" : ""}${formatAda(portfolio.unrealizedPnlAda)} ₳`} tone={portfolio.unrealizedPnlAda >= 0 ? "teal" : "coral"} /><Metric label="Realized P/L" value={`+${formatAda(portfolio.realizedPnlAda)} ₳`} tone="teal" /></div>
      <div className="mt-8 flex gap-1 border-b border-line"><button className={`tab-button ${tab === "OPEN" ? "active" : ""}`} onClick={() => setTab("OPEN")}>Open positions <i>{open.length}</i></button><button className={`tab-button ${tab === "HISTORY" ? "active" : ""}`} onClick={() => setTab("HISTORY")}>History <i>{history.length}</i></button><button className={`tab-button ${tab === "LIQUIDITY" ? "active" : ""}`} onClick={() => setTab("LIQUIDITY")}>LP receipts <i>{portfolio.lpReceipts.length}</i></button></div>
      {tab === "OPEN" && <div className="mt-4 space-y-3">{open.map((position) => <PositionRow position={position} key={position.id} />)}<div className="flex gap-2 rounded-xl border border-blue/15 bg-blue/5 p-4 text-[10px] leading-5 text-muted"><Info size={15} className="mt-0.5 shrink-0 text-blue" /> ProbX phase one does not support partial exits. Create multiple smaller positions if you want staged cash-outs.</div></div>}
      {tab === "HISTORY" && <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-panel"><div className="table-row table-head"><span>Market</span><span>Outcome</span><span>Cost</span><span>Realized P/L</span><span>Status</span></div>{history.map((position) => <div className="table-row" key={position.id}><Link to={`/markets/${position.marketId}`}>{position.statement}</Link><span className={`outcome-chip ${position.outcome.toLowerCase()}`}>{position.outcome}</span><span>{formatAda(position.amountPaidAda)} ₳</span><strong className={(position.realizedPnlAda ?? 0) >= 0 ? "text-teal" : "text-coral"}>{(position.realizedPnlAda ?? 0) >= 0 ? "+" : ""}{formatAda(position.realizedPnlAda ?? 0)} ₳</strong><span>{position.status}</span></div>)}</div>}
      {tab === "LIQUIDITY" && <div className="mt-4 grid gap-3 md:grid-cols-2">{portfolio.lpReceipts.map((receipt) => <Link to={`/markets/${receipt.marketId}/liquidity`} className="receipt-card" key={receipt.id}><div className="flex justify-between"><span className="eyebrow"><Droplets size={12} /> LP receipt</span><span className={`receipt-status ${receipt.status.toLowerCase()}`}>{receipt.status}</span></div><h3>{receipt.statement}</h3><div className="grid grid-cols-3 gap-2"><div><span>Deposited</span><strong>{formatAda(receipt.depositedAda)} ₳</strong></div><div><span>Est. value</span><strong>{formatAda(receipt.estimatedValueAda)} ₳</strong></div><div><span>Fees</span><strong className="text-teal">+{formatAda(receipt.feesEarnedAda)} ₳</strong></div></div><p>Pool ownership {formatPercent(receipt.poolShare, 2)} <ArrowRight size={14} /></p></Link>)}</div>}
    </PageContainer>
  );
}

function PositionRow({ position }: { position: Position }) {
  const [pending, setPending] = useState(false);
  const wallet = useAppStore((state) => state.wallet);
  const notify = useAppStore((state) => state.notify);
  const quote = buildCashOutQuote(position.outcome, position.shares, position.currentProbability, position.amountPaidAda);
  async function cashOut() {
    setPending(true);
    try { const result = await submitAction({ endpoint: `/positions/${position.id}/cashout-payload`, payload: { full_position: true, expected_proceeds_lovelace: Math.round(quote.proceedsAda * 1_000_000) }, walletName: wallet.name }); notify({ tone: "success", title: result.simulated ? "Demo full cash-out" : "Cash-out submitted", description: `${formatAda(quote.proceedsAda, 2)} tADA after 1% LP fee`, txHash: result.txHash }); }
    catch (error) { notify({ tone: "error", title: "Cash-out failed", description: error instanceof Error ? error.message : "Transaction rejected." }); }
    finally { setPending(false); }
  }
  const pnl = quote.proceedsAda - position.amountPaidAda;
  return (
    <div className="position-row"><div className={`position-side ${position.outcome.toLowerCase()}`}>{position.outcome}</div><div className="min-w-0 flex-1"><Link to={`/markets/${position.marketId}`}>{position.statement}</Link><span>Entry {formatPercent(position.entryProbability)} · now {formatPercent(position.currentProbability)} · {formatAda(position.shares)} shares</span></div><div><span>Paid</span><strong>{formatAda(position.amountPaidAda)} ₳</strong></div><div><span>Full exit estimate</span><strong>{formatAda(quote.proceedsAda, 2)} ₳</strong></div><div><span>Estimated P/L</span><strong className={pnl >= 0 ? "text-teal" : "text-coral"}>{pnl >= 0 ? "+" : ""}{formatAda(pnl, 2)} ₳</strong></div><button type="button" className="button secondary" disabled={pending} onClick={() => void cashOut()}>{pending ? <LoaderCircle className="animate-spin" /> : <RotateCcw size={15} />} Full cash-out</button><Link to={`/markets/${position.marketId}`} className="icon-button" aria-label="Open market"><ExternalLink size={15} /></Link></div>
  );
}
