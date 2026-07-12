import { ArrowUpRight, Beaker, Clock3, Droplets, Gauge, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { ForecastDiscovery } from "@/components/forecast-discovery";
import { StatusBadge } from "@/components/status-badge";
import { categoryColor, formatAda, formatCompact, timeUntil } from "@/lib/format";
import type { Market } from "@/types";

export function MarketCard({ market }: { market: Market }) {
  const funding = market.minimumLiquidityAda > 0
    ? Math.min(1, market.liquidityAda / market.minimumLiquidityAda)
    : 1;
  return (
    <Link to={`/markets/${market.id}`} className="market-card group">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><StatusBadge status={market.status} outcome={market.resolutionOutcome} />{market.simulation && <span className="simulation-label"><Beaker size={11} /> simulation</span>}</div>
        <ArrowUpRight size={18} className="text-dim transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-lime" />
      </div>
      <div className="mt-5 flex items-center gap-2 text-[9px] font-black uppercase tracking-[.13em] text-dim"><i className="size-1.5 rounded-full" style={{ background: categoryColor(market.category) }} /> {market.category}</div>
      <h3>{market.statement}</h3>
      <div className="mt-auto pt-5">
        <ForecastDiscovery market={market} compact />
        {market.status === "FUNDING" && (
          <div className="mt-4 rounded-lg border border-teal/15 bg-teal/5 p-3">
            <div className="flex justify-between text-[10px] text-muted"><span className="flex items-center gap-1.5"><Droplets size={13} /> Market liquidity</span><strong>{Math.round(funding * 100)}%</strong></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><i className="block h-full rounded-full bg-teal" style={{ width: `${funding * 100}%` }} /></div>
          </div>
        )}
      </div>
      <div className="market-card-footer">
        {market.status === "PRICE_DISCOVERY" ? <span><Users size={14} /> {100 - market.openingForecast.count} forecasts needed</span> : <span><Gauge size={14} /> {formatCompact(market.volumeAda)} ADA volume</span>}
        <span><Clock3 size={14} /> {timeUntil(market.tradingDeadline)}</span>
      </div>
      <div className="sr-only">Liquidity {formatAda(market.liquidityAda)} ADA</div>
    </Link>
  );
}
