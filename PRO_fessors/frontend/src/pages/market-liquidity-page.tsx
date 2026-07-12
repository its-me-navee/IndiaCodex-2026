import { ArrowLeft, ArrowRight, CircleDollarSign, Droplets, Info, LoaderCircle, LockKeyhole, PieChart, ShieldCheck, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";

import { StatusBadge } from "@/components/status-badge";
import { ErrorState, LoadingState, Metric, PageContainer } from "@/components/ui";
import { useLiquidity, useMarket } from "@/hooks/use-data";
import { submitAction } from "@/lib/actions";
import { formatAda, formatPercent } from "@/lib/format";
import { lpUnitsForDeposit } from "@/lib/market-math";
import { useAppStore } from "@/store/app-store";

interface DepositForm { amount: number }

export function MarketLiquidityPage() {
  const { id } = useParams();
  const marketQuery = useMarket(id);
  const liquidityQuery = useLiquidity(id);
  const [pending, setPending] = useState(false);
  const wallet = useAppStore((state) => state.wallet);
  const notify = useAppStore((state) => state.notify);
  const { register, watch, handleSubmit, setValue } = useForm<DepositForm>({ defaultValues: { amount: 1_000 } });
  const amount = Number(watch("amount") || 0);
  const liquidity = liquidityQuery.data;
  const units = useMemo(() => liquidity ? lpUnitsForDeposit(amount, liquidity.reserveAda, liquidity.totalLpUnits) : 0, [amount, liquidity]);
  if (marketQuery.isLoading || liquidityQuery.isLoading) return <PageContainer className="py-20"><LoadingState label="Reading liquidity state" /></PageContainer>;
  if (!marketQuery.data || !liquidity) return <PageContainer className="py-20"><ErrorState message={marketQuery.error?.message ?? liquidityQuery.error?.message ?? "Liquidity state unavailable."} /></PageContainer>;
  const market = marketQuery.data;
  const newShare = units / Math.max(1, liquidity.totalLpUnits + units);
  async function deposit(values: DepositForm) {
    setPending(true);
    try {
      const result = await submitAction({ endpoint: `/markets/${market.id}/liquidity/deposit-payload`, payload: { amount_lovelace: Math.round(values.amount * 1_000_000), expected_lp_units: Math.floor(units * 1_000_000) }, walletName: wallet.name });
      notify({ tone: "success", title: result.simulated ? "Demo liquidity deposited" : "Liquidity submitted", description: `${formatAda(values.amount)} tADA · receipt bound to this market`, txHash: result.txHash });
    } catch (error) { notify({ tone: "error", title: "Deposit failed", description: error instanceof Error ? error.message : "Transaction rejected." }); }
    finally { setPending(false); }
  }
  return (
    <PageContainer className="py-9 sm:py-12">
      <Link to="/liquidity" className="back-link"><ArrowLeft size={15} /> Liquidity directory</Link>
      <div className="mt-7 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4"><section className="detail-card p-6 sm:p-8"><div className="flex items-center justify-between"><StatusBadge status={market.status} outcome={market.resolutionOutcome} /><span className="eyebrow"><Droplets size={12} /> isolated reserve</span></div><h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-[-.06em]">{market.statement}</h1><p className="mt-3 text-sm text-muted">Provide collateral for appreciated full cash-outs and terminal payouts. This market&apos;s LP receipt never shares risk with another statement.</p></section>
          <section className="detail-card p-5 sm:p-6"><span className="eyebrow">Pool state</span><h2 className="panel-title">Backing and liabilities</h2><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Locked reserve" value={`${formatAda(liquidity.reserveAda)} ₳`} tone="teal" /><Metric label="Available exits" value={`${formatAda(liquidity.availableAda)} ₳`} /><Metric label="LP providers" value={liquidity.providerCount} /><Metric label="Fees earned" value={`${formatAda(liquidity.feesEarnedAda)} ₳`} tone="lime" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="liability-card yes"><span>Worst-case YES liability</span><strong>{formatAda(liquidity.yesLiabilityAda)} ₳</strong><i style={{ width: `${Math.min(100, liquidity.yesLiabilityAda / Math.max(1, liquidity.reserveAda) * 100)}%` }} /></div><div className="liability-card no"><span>Worst-case NO liability</span><strong>{formatAda(liquidity.noLiabilityAda)} ₳</strong><i style={{ width: `${Math.min(100, liquidity.noLiabilityAda / Math.max(1, liquidity.reserveAda) * 100)}%` }} /></div></div><p className="mt-4 flex gap-2 text-[10px] leading-5 text-dim"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-teal" /> The validator rejects any position or cash-out transition that breaches worst-case solvency.</p></section>
          <section className="detail-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><span className="eyebrow">Your market receipts</span><h2 className="panel-title">LP positions</h2></div><PieChart className="text-teal" /></div><div className="mt-5 space-y-2">{liquidity.receipts.length ? liquidity.receipts.map((receipt) => <div className="receipt-row" key={receipt.id}><div><span>Receipt {receipt.id}</span><strong>{formatAda(receipt.depositedAda)} ₳ deposited</strong></div><div><span>Pool share</span><strong>{formatPercent(receipt.poolShare, 2)}</strong></div><div><span>Estimated value</span><strong className="text-teal">{formatAda(receipt.estimatedValueAda)} ₳</strong></div><span className={`receipt-status ${receipt.status.toLowerCase()}`}>{receipt.status}</span></div>) : <div className="rounded-xl border border-dashed border-line py-9 text-center text-xs text-dim">No connected-wallet receipt indexed for this market.</div>}</div></section>
        </div>
        <aside className="sticky top-[88px]"><form className="action-panel" onSubmit={handleSubmit(deposit)}><div className="flex items-start justify-between"><div><span className="eyebrow">Provide liquidity</span><h2>Mint an LP receipt</h2></div><CircleDollarSign className="text-teal" /></div><p>Capital and all earned fees stay in this market until it becomes terminal and user claims settle.</p><label className="form-field"><span>Deposit tADA</span><div className="amount-input"><input type="number" min="10" step="10" {...register("amount", { valueAsNumber: true, min: 10 })} /><em>₳</em></div></label><div className="quick-grid">{[100, 500, 1_000, 5_000].map((value) => <button type="button" key={value} onClick={() => setValue("amount", value)}>{formatAda(value)}</button>)}</div><div className="quote-table"><div><span>Estimated LP units</span><strong>{formatAda(units, 2)}</strong></div><div><span>New pool share</span><strong>{formatPercent(newShare, 3)}</strong></div><div><span>Trade fee share</span><strong className="text-teal">1.00% pool-wide</strong></div><div className="total"><span>Deposit</span><strong>{formatAda(amount)} ₳</strong></div></div><button className="button teal w-full" disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" /> Building deposit</> : <>Deposit and mint receipt <ArrowRight size={16} /></>}</button><small className="action-note"><LockKeyhole size={13} /> Full receipt redemption only after terminal settlement.</small><small className="action-note"><Info size={13} /> LP value can rise or fall. Principal is not guaranteed.</small></form><div className="mt-3 detail-card p-4"><span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted"><TrendingUp size={14} className="text-lime" /> Fee engine</span><p className="mt-2 text-[10px] leading-5 text-dim">Every buy and full position cash-out directs exactly 1% to this reserve. No fee is paid to the market creator or admin.</p></div></aside>
      </div>
    </PageContainer>
  );
}
