import { Activity, ArrowLeft, CheckCircle2, Clock3, Copy, Droplets, ExternalLink, FileCheck2, Fingerprint, Info, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { CashOutCard } from "@/components/cashout-card";
import { ForecastDiscovery } from "@/components/forecast-discovery";
import { ProbabilityChart } from "@/components/probability-chart";
import { StatusBadge } from "@/components/status-badge";
import { TradePanel } from "@/components/trade-panel";
import { ErrorState, LoadingState, Metric, PageContainer } from "@/components/ui";
import { demoPortfolio } from "@/data/demo";
import { useMarket } from "@/hooks/use-data";
import { categoryColor, formatAda, formatDate, formatPercent, shortHash, timeUntil } from "@/lib/format";

export function MarketDetailPage() {
  const { id } = useParams();
  const query = useMarket(id);
  if (query.isLoading) return <PageContainer className="py-20"><LoadingState label="Reading market state" /></PageContainer>;
  if (query.error || !query.data) return <PageContainer className="py-20"><ErrorState message={query.error?.message ?? "Market not found."} retry={() => void query.refetch()} /></PageContainer>;
  const market = query.data;
  const position = demoPortfolio.positions.find((item) => item.marketId === market.id && item.status === "OPEN");
  return (
    <PageContainer className="py-8 sm:py-11">
      <div className="flex items-center justify-between"><Link to="/markets" className="back-link"><ArrowLeft size={15} /> All markets</Link><span className="hidden items-center gap-2 font-mono text-[9px] text-dim sm:flex">MARKET/{shortHash(market.id, 13, 4)} <Copy size={12} /></span></div>
      <div className="mt-7 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_370px]">
        <div className="space-y-4">
          <section className="detail-card p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><StatusBadge status={market.status} outcome={market.resolutionOutcome} />{market.simulation && <span className="simulation-label">disclosed simulation</span>}</div><span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.12em] text-dim"><i className="size-1.5 rounded-full" style={{ background: categoryColor(market.category) }} />{market.category}</span></div>
            <h1 className="mt-6 max-w-4xl font-display text-[clamp(2rem,5vw,3.8rem)] font-semibold leading-[1.05] tracking-[-.065em]">{market.statement}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">{market.description}</p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[10px] text-dim"><span className="flex items-center gap-1.5"><Clock3 size={14} /> Trading closes {timeUntil(market.tradingDeadline)}</span><span className="flex items-center gap-1.5 text-amber"><ShieldCheck size={14} /> Trusted admin resolution · 1-of-1</span><span className="flex items-center gap-1.5"><LockKeyhole size={14} /> 1% fee belongs to LPs</span></div>
          </section>

          <section className="detail-card p-5 sm:p-6">
            <div className="mb-5 flex items-end justify-between"><div><span className="eyebrow">Live probability</span><h2 className="panel-title">Market signal</h2></div>{market.yesProbability != null && <div className="text-right"><span className="data-label">YES now</span><strong className="block font-display text-3xl text-lime">{formatPercent(market.yesProbability)}</strong></div>}</div>
            {market.status === "PRICE_DISCOVERY" ? <ForecastDiscovery market={market} /> : <ProbabilityChart points={market.chart} />}
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Trading volume" value={`${formatAda(market.volumeAda)} ₳`} /><Metric label="Position collateral" value={`${formatAda(market.predictionPoolAda)} ₳`} /><Metric label="Market liquidity" value={`${formatAda(market.liquidityAda)} ₳`} tone="teal" /><Metric label="LP fee" value="1.00%" detail="per buy and cash-out" tone="lime" /></div>
          </section>

          <section className="detail-card overflow-hidden">
            <div className="border-b border-line p-5 sm:p-6"><span className="eyebrow">Immutable terms</span><h2 className="panel-title">What resolves this market</h2></div>
            <div className="divide-y divide-line"><div className="term-row"><CheckCircle2 /><div><span>YES condition</span><p>{market.yesRule}</p></div></div><div className="term-row"><FileCheck2 /><div><span>Primary source</span><p>{market.primarySource}</p><small>Backup: {market.backupSource}</small></div></div><div className="term-row"><Info /><div><span>Invalid / VOID rule</span><p>{market.invalidRule}</p></div></div><div className="term-row"><Clock3 /><div><span>Fixed windows</span><p>Trading: {formatDate(market.tradingDeadline)}</p><small>Resolution deadline: {formatDate(market.resolutionDeadline)}</small></div></div></div>
          </section>

          <section className="detail-card p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><span className="eyebrow">Market-specific backing</span><h2 className="panel-title">Liquidity and solvency</h2></div><Link to={`/markets/${market.id}/liquidity`} className="button secondary"><Droplets size={16} /> Manage liquidity</Link></div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3"><Metric label="Available for exits" value={`${formatAda(market.availableLiquidityAda)} ₳`} tone="teal" /><Metric label="YES liability" value={`${formatAda(market.yesLiabilityAda)} ₳`} /><Metric label="NO liability" value={`${formatAda(market.noLiabilityAda)} ₳`} /></div>
            <p className="mt-4 flex gap-2 text-[10px] leading-5 text-dim"><LockKeyhole size={14} className="mt-0.5 shrink-0 text-teal" /> This reserve backs only this statement. LP receipts remain locked until resolution or VOID and all user claims settle.</p>
          </section>

          <section className="detail-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><span className="eyebrow">Confirmed activity</span><h2 className="panel-title">Latest state changes</h2></div><Activity className="text-lime" /></div><div className="mt-5 divide-y divide-line">{market.activity.length ? market.activity.map((item) => <div className="activity-row" key={item.id}><span className={`activity-icon ${item.type.toLowerCase()}`}><Activity size={14} /></span><div><strong>{item.type.replaceAll("_", " ")}{item.outcome ? ` · ${item.outcome}` : ""}</strong><small>{item.wallet}</small></div>{item.amountAda != null && <b>{formatAda(item.amountAda)} ₳</b>}<span>{timeUntil(item.timestamp)}</span>{item.txHash && <a href="#" aria-label="Explorer"><ExternalLink size={13} /></a>}</div>) : <div className="py-10 text-center text-xs text-dim">Activity starts after discovery and funding.</div>}</div></section>
        </div>

        <aside className="sticky top-[88px] space-y-3"><TradePanel market={market} />{position && market.status === "TRADING" && <CashOutCard position={position} />}<div className="detail-card p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-muted"><Fingerprint size={15} className="text-blue" /> Opening proof</div><div className="mt-3 flex justify-between text-xs"><span className="text-dim">Forecasts</span><strong>{market.openingForecast.count}/100</strong></div><div className="mt-2 flex justify-between text-xs"><span className="text-dim">Poll root</span><strong className="font-mono">{market.openingForecast.pollRoot ?? "pending"}</strong></div><div className="mt-2 flex justify-between text-xs"><span className="text-dim">Admin attestation</span><strong>{market.openingForecast.confirmedBy}/1</strong></div><p className="mt-3 flex gap-2 border-t border-line pt-3 text-[9px] leading-4 text-dim"><Users size={13} className="shrink-0" /> {market.openingForecast.simulated ? "100 disclosed virtual forecasts; excluded from real reputation." : "One signed opening forecast per unique payment credential."}</p><p className="mt-3 border-t border-line pt-3 text-[9px] leading-4 text-dim">Outcome resolution is trusted and centralized for this MVP. The admin signs evidence only and cannot custody user or LP funds.</p></div></aside>
      </div>
    </PageContainer>
  );
}
