import type { MarketStatus, ResolutionOutcome } from "@/types";

const labels: Record<MarketStatus, string> = {
  DRAFT: "Draft",
  PRICE_DISCOVERY: "Price discovery",
  FUNDING: "Funding",
  TRADING: "Trading live",
  CLOSED: "Awaiting result",
  RESOLVED: "Resolved",
  VOID: "Voided",
};

export function StatusBadge({ status, outcome }: { status: MarketStatus; outcome?: ResolutionOutcome | null }) {
  const tone = status === "TRADING" ? "live" : status === "PRICE_DISCOVERY" ? "discovery" : status === "FUNDING" ? "funding" : status === "VOID" ? "void" : status === "RESOLVED" ? "resolved" : "muted";
  return <span className={`status-badge ${tone}`}><i />{status === "RESOLVED" && outcome ? `${outcome} resolved` : labels[status]}</span>;
}
