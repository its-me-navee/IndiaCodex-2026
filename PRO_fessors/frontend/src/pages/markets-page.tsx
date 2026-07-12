import { Filter, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { MarketCard } from "@/components/market-card";
import { ErrorState, PageContainer, PageHeader, SkeletonCards } from "@/components/ui";
import { useMarkets } from "@/hooks/use-data";
import type { MarketStatus } from "@/types";

type FilterValue = "ALL" | MarketStatus;

export function MarketsPage() {
  const query = useMarkets();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [category, setCategory] = useState("ALL");
  const markets = query.data ?? [];
  const categories = ["ALL", ...new Set(markets.map((market) => market.category))];
  const visible = useMemo(() => markets.filter((market) => {
    const matchesSearch = `${market.statement} ${market.category}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (filter === "ALL" || market.status === filter) && (category === "ALL" || market.category === category);
  }), [category, filter, markets, search]);
  return (
    <PageContainer className="py-12 sm:py-16">
      <PageHeader eyebrow="Market directory" title="Every statement. One public state." description="Browse active trading, opening discovery, and market-specific funding rounds on Cardano preprod." actions={<Link to="/create" className="button primary"><Plus size={16} /> New market</Link>} />
      <div className="mt-9 flex flex-col gap-3 rounded-2xl border border-line bg-panel p-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-3 text-dim" /><input className="control h-10 w-full pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search statements or categories" /></label>
        <div className="flex min-w-0 gap-2 overflow-auto"><span className="filter-icon"><Filter size={14} /></span>{(["ALL", "TRADING", "PRICE_DISCOVERY", "FUNDING", "RESOLVED"] as FilterValue[]).map((item) => <button type="button" key={item} className={`filter-chip ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item === "ALL" ? "All states" : item.replaceAll("_", " ")}</button>)}</div>
        <label className="relative"><SlidersHorizontal size={14} className="absolute left-3 top-3 text-dim" /><select value={category} onChange={(event) => setCategory(event.target.value)} className="control h-10 min-w-40 pl-9">{categories.map((item) => <option key={item}>{item === "ALL" ? "All categories" : item}</option>)}</select></label>
      </div>
      <div className="mt-5 flex items-center justify-between text-[10px] uppercase tracking-widest text-dim"><span>{visible.length} markets</span><span>Probability · liquidity · volume</span></div>
      <div className="mt-4">{query.isLoading ? <SkeletonCards count={6} /> : query.error ? <ErrorState message={query.error.message} retry={() => void query.refetch()} /> : visible.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map((market) => <MarketCard market={market} key={market.id} />)}</div> : <div className="state-card">No markets match those filters.</div>}</div>
    </PageContainer>
  );
}
