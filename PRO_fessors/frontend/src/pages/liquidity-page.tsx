import { ArrowRight, Droplets, LockKeyhole, ShieldCheck, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

import { StatusBadge } from "@/components/status-badge";
import { ErrorState, PageContainer, PageHeader, SkeletonCards } from "@/components/ui";
import { useMarkets } from "@/hooks/use-data";
import { formatAda, formatPercent } from "@/lib/format";

export function LiquidityPage() {
  const query = useMarkets();
  const markets = (query.data ?? []).filter((market) => ["FUNDING", "TRADING", "RESOLVED", "VOID"].includes(market.status));
  return (
    <PageContainer className="py-12 sm:py-16">
      <PageHeader eyebrow="Community market-making" title="Liquidity, isolated by statement." description="Choose the exact market you want to back. LP receipts, fees, gains, and losses never cross into another market." />
      <div className="mt-8 grid gap-3 sm:grid-cols-3"><div className="principle-card"><Droplets /><h3>Per-market reserves</h3><p>No global pool spreads one market&apos;s risk into another.</p></div><div className="principle-card"><TrendingUp /><h3>1% trading fees</h3><p>Every buy and full cash-out pays that market&apos;s LPs.</p></div><div className="principle-card"><LockKeyhole /><h3>Locked until terminal</h3><p>Full LP redemption begins after claims settle or the market is voided.</p></div></div>
      <div className="mt-10 flex items-end justify-between"><div><span className="eyebrow">Liquidity opportunities</span><h2 className="panel-title">Select a market</h2></div><span className="text-[10px] uppercase tracking-widest text-dim">Test ADA · preprod</span></div>
      <div className="mt-4">{query.isLoading ? <SkeletonCards /> : query.error ? <ErrorState message={query.error.message} retry={() => void query.refetch()} /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{markets.map((market) => {
        const funding = Math.min(1, market.liquidityAda / market.minimumLiquidityAda);
        return <Link className="liquidity-card group" key={market.id} to={`/markets/${market.id}/liquidity`}><div className="flex justify-between"><StatusBadge status={market.status} outcome={market.resolutionOutcome} /><ArrowRight size={17} className="text-dim transition group-hover:translate-x-1 group-hover:text-teal" /></div><h3>{market.statement}</h3><div className="grid grid-cols-2 gap-2"><div><span>Reserve</span><strong>{formatAda(market.liquidityAda)} ₳</strong></div><div><span>Fees earned</span><strong className="text-teal">{formatAda(market.volumeAda * .01)} ₳</strong></div></div><div className="mt-4"><div className="flex justify-between text-[9px] uppercase tracking-wider text-dim"><span>{market.status === "FUNDING" ? "Funding threshold" : "Liquidity health"}</span><strong>{formatPercent(funding)}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><i className="block h-full bg-teal" style={{ width: `${funding * 100}%` }} /></div></div><p><ShieldCheck size={13} /> Worst-case liability: {formatAda(Math.max(market.yesLiabilityAda, market.noLiabilityAda))} ₳</p></Link>;
      })}</div>}</div>
    </PageContainer>
  );
}
