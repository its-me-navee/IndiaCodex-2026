import { CheckCircle2, Fingerprint, Users } from "lucide-react";

import { formatPercent } from "@/lib/format";
import type { Market } from "@/types";

export function ForecastDiscovery({ market, compact = false }: { market: Market; compact?: boolean }) {
  const opening = market.openingForecast;
  const complete = opening.count === 100;
  if (complete && market.yesProbability != null) {
    return (
      <div className={compact ? "opening-result compact" : "opening-result"}>
        <div><span>YES</span><strong>{formatPercent(market.yesProbability)}</strong></div>
        <div className="opening-track"><i style={{ width: `${market.yesProbability * 100}%` }} /></div>
        <div><strong>{formatPercent(1 - market.yesProbability)}</strong><span>NO</span></div>
      </div>
    );
  }
  const progress = opening.count;
  return (
    <div className={`discovery-panel ${compact ? "compact" : ""}`}>
      <div className="flex items-center justify-between"><span className="flex items-center gap-1.5"><Fingerprint size={14} /> Opening discovery</span><strong>{progress}/100</strong></div>
      <div className="discovery-track"><i style={{ width: `${progress}%` }} /></div>
      {!compact && <div className="flex items-start gap-2 text-[10px] leading-4 text-dim"><Users size={14} className="mt-0.5 shrink-0" /><span>Opening probability is revealed only after 100 unique signed forecasts. It does not default to 50/50.</span></div>}
      {opening.simulated && <span className="simulation-label"><CheckCircle2 size={11} /> disclosed simulated cohort</span>}
    </div>
  );
}
