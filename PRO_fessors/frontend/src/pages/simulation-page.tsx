import { Activity, Beaker, Database, Gauge, Pause, Play, Radio, Server, ShieldAlert, Users, Wifi } from "lucide-react";
import { useState } from "react";

import { ErrorState, LoadingState, Metric, PageContainer, PageHeader } from "@/components/ui";
import { useSimulation } from "@/hooks/use-data";
import { formatAda, formatCompact, timeUntil } from "@/lib/format";

export function SimulationPage() {
  const query = useSimulation();
  const [paused, setPaused] = useState(false);
  if (query.isLoading) return <PageContainer className="py-20"><LoadingState label="Connecting to simulation stream" /></PageContainer>;
  if (query.error || !query.data) return <PageContainer className="py-20"><ErrorState message={query.error?.message ?? "Simulation unavailable."} /></PageContainer>;
  const simulation = query.data;
  const maxPnl = Math.max(...simulation.strategies.map((item) => Math.abs(item.pnlAda)));
  return (
    <PageContainer className="py-12 sm:py-16">
      <div className="simulation-warning"><ShieldAlert /><div><strong>Off-chain load simulation</strong><p>10,000 virtual personas exercise API, PostgreSQL, Redis, workers, and WebSockets. They are not 10,000 people or concurrent Cardano transactions.</p></div><span>SEED {simulation.seed}</span></div>
      <div className="mt-8"><PageHeader eyebrow="Deterministic load lab" title="10,000 strategies. One honest label." description="A reproducible activity engine makes the demo feel alive while a risk controller submits only a small, collateralized subset to preprod." actions={<button className="button secondary" onClick={() => setPaused((value) => !value)}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? "Resume view" : "Pause view"}</button>} /></div>
      <div className="mt-8 grid grid-cols-2 gap-2 lg:grid-cols-6"><Metric label="Virtual personas" value={formatCompact(simulation.personas)} tone="lime" /><Metric label="Actions / min" value={formatCompact(paused ? 0 : simulation.actionsPerMinute)} tone="teal" /><Metric label="Queue depth" value={formatCompact(simulation.queuedActions)} /><Metric label="Database events" value={formatCompact(simulation.databaseEvents)} /><Metric label="WS clients" value={simulation.websocketClients} /><Metric label="Backed preprod txs" value={simulation.backedTransactions} detail="controlled subset" /></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_.9fr]">
        <section className="detail-card p-5 sm:p-6"><div className="flex justify-between"><div><span className="eyebrow">Strategy cohorts</span><h2 className="panel-title">Simulated realized P/L</h2></div><Gauge className="text-lime" /></div><div className="mt-6 space-y-5">{simulation.strategies.map((strategy) => <div key={strategy.name}><div className="flex items-end justify-between text-xs"><span><strong>{strategy.name}</strong><small className="ml-2 text-dim">{strategy.personas.toLocaleString()} personas</small></span><b className={strategy.pnlAda >= 0 ? "text-teal" : "text-coral"}>{strategy.pnlAda >= 0 ? "+" : ""}{formatAda(strategy.pnlAda)} sim ₳</b></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><i className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.abs(strategy.pnlAda) / maxPnl * 100)}%`, background: strategy.color }} /></div></div>)}</div><div className="mt-6 border-t border-line pt-4 text-[9px] leading-4 text-dim">Simulated P/L never enters the default wallet leaderboard and is not redeemable on-chain.</div></section>
        <section className="detail-card overflow-hidden"><div className="flex items-center justify-between border-b border-line p-5"><div><span className="eyebrow">WebSocket stream</span><h2 className="panel-title">Recent virtual actions</h2></div><span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-teal"><i className="size-1.5 animate-pulse rounded-full bg-teal" /> live</span></div><div className="max-h-[460px] overflow-auto divide-y divide-line">{simulation.recentActions.map((action, index) => <div className="simulation-action" key={`${action.id}-${index}`}><span><Activity size={14} /></span><div><strong>{action.type} {action.outcome}</strong><small>persona_{String(index * 791 + 42).padStart(5, "0")} · {action.simulated ? "virtual" : "preprod-backed"}</small></div><b>{action.amountAda ? `${formatAda(action.amountAda)} sim ₳` : "—"}</b><em>{timeUntil(action.timestamp)}</em></div>)}</div></section>
      </div>
      <section className="mt-4 detail-card p-5 sm:p-6"><span className="eyebrow">What is being tested</span><h2 className="panel-title">Load boundary</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="boundary-card"><Server /><strong>FastAPI</strong><p>Quotes, portfolios, market projections, and rate limits.</p></div><div className="boundary-card"><Database /><strong>PostgreSQL + Redis</strong><p>Durable events, queues, strategy state, and cache churn.</p></div><div className="boundary-card"><Wifi /><strong>WebSockets</strong><p>Sequenced live updates with snapshot recovery after reconnect.</p></div><div className="boundary-card"><Radio /><strong>Cardano subset</strong><p>Only controlled, funded actions become actual preprod transactions.</p></div></div></section>
    </PageContainer>
  );
}
