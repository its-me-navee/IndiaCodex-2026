import { Award, Crown, Medal, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";

import { ErrorState, LoadingState, PageContainer, PageHeader } from "@/components/ui";
import { useLeaderboard } from "@/hooks/use-data";
import { formatAda, formatCompact, formatPercent } from "@/lib/format";

export function LeaderboardPage() {
  const query = useLeaderboard();
  if (query.isLoading) return <PageContainer className="py-20"><LoadingState label="Rebuilding realized P/L" /></PageContainer>;
  if (query.error || !query.data) return <PageContainer className="py-20"><ErrorState message={query.error?.message ?? "Leaderboard unavailable."} /></PageContainer>;
  const top = query.data.slice(0, 3);
  return (
    <>
      <section className="leaderboard-hero"><PageContainer><PageHeader eyebrow="Non-simulated wallets" title="Conviction, realized." description="Ranked primarily by confirmed realized tADA profit. Accuracy and resolved position count provide context; virtual simulation personas are excluded." /></PageContainer></section>
      <PageContainer className="-mt-16 pb-20">
        <div className="podium-grid">{[1, 0, 2].map((index) => { const item = top[index]; const Icon = index === 0 ? Crown : index === 1 ? Medal : Award; return item ? <div className={`podium-entry rank-${index + 1}`} key={item.wallet}><Icon /><span>#{index + 1}</span><i>{item.wallet.slice(-4).toUpperCase()}</i><strong>{item.wallet}</strong><b>+{formatAda(item.realizedPnlAda)} ₳</b><small>{formatPercent(item.accuracy)} accuracy · {item.resolvedPositions} resolved</small></div> : null; })}</div>
        <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-panel"><div className="flex items-center justify-between border-b border-line p-5"><div><span className="eyebrow">All forecasters</span><h2 className="panel-title">Realized-P/L ranking</h2></div><button className="icon-button" onClick={() => void query.refetch()}><RefreshCw size={16} /></button></div><div className="leader-row header"><span>Rank</span><span>Wallet</span><span>Realized P/L</span><span>Accuracy</span><span>Resolved</span><span>Volume</span><span>Streak</span></div>{query.data.map((item) => <div className="leader-row" key={item.wallet}><span><strong>#{item.rank}</strong></span><span className="wallet-cell"><i>{item.wallet.slice(-2).toUpperCase()}</i><b>{item.wallet}</b></span><span className="text-teal">+{formatAda(item.realizedPnlAda)} ₳</span><span><b>{formatPercent(item.accuracy)}</b><i className="accuracy"><em style={{ width: `${item.accuracy * 100}%` }} /></i></span><span>{item.resolvedPositions}</span><span>{formatCompact(item.volumeAda)} ₳</span><span className="text-lime"><TrendingUp size={13} /> {item.streak}</span></div>)}</section>
        <div className="mt-4 flex gap-3 rounded-xl border border-dashed border-line p-4"><ShieldCheck className="shrink-0 text-teal" size={19} /><p className="text-[10px] leading-5 text-dim"><strong className="block text-ink">Indexed, not self-reported.</strong>Profit is reconstructed from confirmed position purchases, full cash-outs, and redemptions. Estimated open-position value never affects rank.</p></div>
      </PageContainer>
    </>
  );
}
