import { ArrowRight, BarChart3, CheckCircle2, Droplets, Fingerprint, LockKeyhole, Radio, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";

import { MarketCard } from "@/components/market-card";
import { PageContainer, SkeletonCards } from "@/components/ui";
import { useMarkets } from "@/hooks/use-data";
import { formatCompact } from "@/lib/format";

export function HomePage() {
  const query = useMarkets();
  const markets = query.data ?? [];
  const explicitlyFeatured = markets.filter((market) => market.featured);
  const featured = (explicitlyFeatured.length
    ? explicitlyFeatured
    : markets.filter((market) => market.status === "TRADING")
  ).slice(0, 3);
  const volume = markets.reduce((sum, market) => sum + market.volumeAda, 0);
  const liquidity = markets.reduce((sum, market) => sum + market.liquidityAda, 0);
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="hero-grid absolute inset-0 opacity-35" />
        <div className="hero-orb -right-36 -top-64 size-[700px]" />
        <PageContainer className="relative grid min-h-[590px] items-center gap-12 py-16 lg:grid-cols-[1.08fr_.92fr]">
          <div>
            <span className="eyebrow"><Radio size={12} /> live on Cardano preprod</span>
            <h1 className="mt-6 max-w-3xl font-display text-[clamp(3.4rem,7vw,6.7rem)] font-semibold leading-[.87] tracking-[-.075em]">Forecast.<br /><span className="text-lime">Fund.</span> Prove.</h1>
            <p className="mt-7 max-w-xl text-[16px] leading-7 text-muted">Statement markets with signed price discovery, market-isolated liquidity, and non-custodial positions. No bookmaker. No hidden balance.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link to="/markets" className="button primary">Explore markets <ArrowRight size={17} /></Link><Link to="/create" className="button secondary">Create a statement</Link></div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-semibold uppercase tracking-[.09em] text-dim"><span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-teal" /> transparent custody</span><span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-teal" /> 1% fee to LPs</span><span className="flex items-center gap-1.5"><WalletCards size={14} className="text-teal" /> full cash-out</span></div>
          </div>
          <div className="hero-market-window">
            <div className="flex items-center justify-between border-b border-line px-5 py-3"><span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.13em] text-muted"><i className="size-1.5 animate-pulse rounded-full bg-teal shadow-[0_0_8px_#5ae6c5]" /> market signal</span><span className="font-mono text-[9px] text-dim">PREPROD / STATE #1492</span></div>
            <div className="p-6 sm:p-8">
              <span className="text-[9px] font-black uppercase tracking-[.14em] text-blue">Crypto · trading</span>
              <h2 className="mt-3 font-display text-2xl font-semibold leading-8 tracking-[-.04em]">Will ADA trade at or above $1.00 before 31 December 2026?</h2>
              <div className="mt-8 grid grid-cols-2 gap-3"><div className="hero-outcome yes"><span>YES</span><strong>62%</strong><small>+4.2% today</small></div><div className="hero-outcome no"><span>NO</span><strong>38%</strong><small>market price</small></div></div>
              <div className="mini-chart mt-7"><svg viewBox="0 0 600 130" preserveAspectRatio="none"><path className="area" d="M0 108 C55 95 72 111 115 90 S176 48 220 71 S292 90 330 55 S391 31 423 49 S493 72 531 36 S575 25 600 14 L600 130 L0 130Z" /><path d="M0 108 C55 95 72 111 115 90 S176 48 220 71 S292 90 330 55 S391 31 423 49 S493 72 531 36 S575 25 600 14" /></svg></div>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-5 text-xs"><div><span className="data-label">Volume</span><strong>296.8k ₳</strong></div><div><span className="data-label">Liquidity</span><strong>482.5k ₳</strong></div><div><span className="data-label">LP fee</span><strong className="text-lime">1.00%</strong></div></div>
            </div>
          </div>
        </PageContainer>
      </section>

      <section className="border-b border-line bg-panel/45"><PageContainer className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0"><div className="home-stat"><span>Live markets</span><strong>{markets.filter((item) => item.status === "TRADING").length || 4}</strong></div><div className="home-stat"><span>Forecast volume</span><strong>{formatCompact(volume || 2_100_000)} <small>₳</small></strong></div><div className="home-stat"><span>Locked liquidity</span><strong>{formatCompact(liquidity || 1_800_000)} <small>₳</small></strong></div><div className="home-stat"><span>Resolution authority</span><strong className="flex items-center gap-2 text-base text-amber"><LockKeyhole size={17} /> Admin 1-of-1</strong></div></PageContainer></section>

      <PageContainer className="py-20">
        <div className="section-heading"><div><span className="eyebrow">Featured signals</span><h2>Markets moving now</h2><p>Every price began with 100 disclosed forecasts—not an arbitrary 50/50.</p></div><Link to="/markets" className="button secondary">View all <ArrowRight size={16} /></Link></div>
        <div className="mt-8">{query.isLoading ? <SkeletonCards /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{featured.map((market) => <MarketCard key={market.id} market={market} />)}</div>}</div>
      </PageContainer>

      <section className="border-y border-line bg-panel/40 py-20"><PageContainer><div className="mx-auto max-w-2xl text-center"><span className="eyebrow"><Sparkles size={12} /> Market lifecycle</span><h2 className="mt-3 font-display text-4xl font-semibold tracking-[-.055em]">A probability has to earn its opening.</h2><p className="mt-3 text-sm leading-6 text-muted">Off-chain discovery keeps the product fast. Cardano takes over where custody and enforcement matter.</p></div><div className="mt-11 grid gap-3 md:grid-cols-3"><div className="process-card"><span>01</span><Fingerprint /><h3>100 signed forecasts</h3><p>One free forecast per payment credential. The trusted admin signs the published poll root and bounded opening tick once.</p></div><div className="process-card"><span>02</span><Droplets /><h3>One liquidity pool</h3><p>Providers fund only the market they choose. Their receipt cannot absorb risk from unrelated statements.</p></div><div className="process-card"><span>03</span><BarChart3 /><h3>Trade and fully exit</h3><p>Buy YES or NO from the integer curve. Before the deadline, burn the entire position for its current value.</p></div></div><p className="mx-auto mt-7 max-w-2xl text-center text-[10px] leading-5 text-dim">Hackathon trust boundary: one admin wallet signs outcomes but never holds stake or LP funds. Production should add data oracles, disputes, and multi-party quorum governance.</p></PageContainer></section>
    </>
  );
}
