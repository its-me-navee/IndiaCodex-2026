import { ArrowRight, Calculator, Check, CircleDollarSign, Info, LoaderCircle, LockKeyhole, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

import { submitAction } from "@/lib/actions";
import { formatAda, formatPercent } from "@/lib/format";
import { buildQuote } from "@/lib/market-math";
import { useAppStore } from "@/store/app-store";
import type { BinaryOutcome, Market } from "@/types";

interface TradeForm { amount: number }

export function TradePanel({ market }: { market: Market }) {
  const [side, setSide] = useState<BinaryOutcome>("YES");
  const [pending, setPending] = useState(false);
  const wallet = useAppStore((state) => state.wallet);
  const notify = useAppStore((state) => state.notify);
  const { register, watch, handleSubmit, setValue, formState: { errors } } = useForm<TradeForm>({ defaultValues: { amount: 100 } });
  const amount = Number(watch("amount") || 0);
  const quote = useMemo(() => buildQuote(market.yesProbability ?? 0.5, side, amount, market.availableLiquidityAda), [amount, market.availableLiquidityAda, market.yesProbability, side]);

  async function submit(values: TradeForm) {
    setPending(true);
    try {
      const result = await submitAction({ endpoint: `/markets/${market.id}/position-payload`, payload: { outcome: side, amount_lovelace: Math.round(values.amount * 1_000_000), expected_probability_tick: Math.round((market.yesProbability ?? 0.5) * 100) }, walletName: wallet.name });
      notify({ tone: "success", title: result.simulated ? "Demo position opened" : "Position submitted", description: `${side} · ${formatAda(values.amount)} tADA · includes 1% LP fee`, txHash: result.txHash });
    } catch (error) { notify({ tone: "error", title: "Position failed", description: error instanceof Error ? error.message : "Transaction was rejected." }); }
    finally { setPending(false); }
  }

  if (market.status === "PRICE_DISCOVERY") return <ForecastPanel market={market} />;
  if (market.status === "FUNDING") return (
    <div className="action-panel">
      <span className="eyebrow">Trading not open</span><h2>Liquidity comes first.</h2><p>This market completed discovery at {formatPercent(market.yesProbability ?? 0)}, but still needs {formatAda(Math.max(0, market.minimumLiquidityAda - market.liquidityAda))} tADA of isolated backing.</p>
      <div className="funding-big"><span>Funded</span><strong>{Math.round((market.liquidityAda / market.minimumLiquidityAda) * 100)}%</strong><i><b style={{ width: `${Math.min(100, market.liquidityAda / market.minimumLiquidityAda * 100)}%` }} /></i></div>
      <Link to={`/markets/${market.id}/liquidity`} className="button teal w-full"><CircleDollarSign size={17} /> Provide liquidity</Link>
      <small className="action-note"><LockKeyhole size={13} /> LP capital stays in this market until settlement.</small>
    </div>
  );
  if (market.status !== "TRADING") return <div className="action-panel"><span className="eyebrow">Market closed</span><h2>{market.status === "VOID" ? "This market was voided." : market.status === "RESOLVED" ? `${market.resolutionOutcome} won.` : "Trading has ended."}</h2><p>New positions and cash-outs are disabled after the fixed trading deadline.</p></div>;

  return (
    <form className="action-panel" onSubmit={handleSubmit(submit)}>
      <div className="flex items-start justify-between"><div><span className="eyebrow">Take a position</span><h2>Trade the statement</h2></div><Calculator className="text-lime" size={22} /></div>
      <div className="side-picker"><button type="button" onClick={() => setSide("YES")} className={side === "YES" ? "yes active" : "yes"}><span>YES</span><strong>{formatPercent(market.yesProbability ?? 0)}</strong></button><button type="button" onClick={() => setSide("NO")} className={side === "NO" ? "no active" : "no"}><span>NO</span><strong>{formatPercent(1 - (market.yesProbability ?? 0))}</strong></button></div>
      <label className="form-field"><span>Commit tADA</span><div className="amount-input"><input type="number" step="1" min="5" {...register("amount", { required: true, min: 5, max: Math.max(5, market.availableLiquidityAda * .3) })} /><em>₳</em></div>{errors.amount && <small className="text-coral">Minimum 5 tADA; market solvency sets the maximum.</small>}</label>
      <div className="quick-grid">{[25, 100, 250, 500].map((value) => <button type="button" key={value} onClick={() => setValue("amount", value, { shouldValidate: true })}>{value}</button>)}</div>
      <div className="quote-table"><div><span>Estimated shares</span><strong>{formatAda(quote.shares, 2)}</strong></div><div><span>Average probability</span><strong>{formatPercent(side === "YES" ? quote.averageProbability : 1 - quote.averageProbability, 1)}</strong></div><div><span>Price impact</span><strong>{formatPercent(quote.priceImpact, 2)}</strong></div><div><span>LP fee · 1%</span><strong className="text-teal">{formatAda(quote.feeAda, 2)} ₳</strong></div><div className="total"><span>Maximum payout</span><strong>{formatAda(quote.maximumPayoutAda, 2)} ₳</strong></div></div>
      <button className={`button w-full ${side === "YES" ? "yes-button" : "no-button"}`} disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" /> Preparing transaction</> : <>Buy {side} <ArrowRight size={17} /></>}</button>
      {!wallet.connected && <small className="action-note"><WalletCards size={13} /> No wallet detected: submission runs as a clearly labeled demo.</small>}
      <small className="action-note"><Info size={13} /> Execution uses the latest state UTxO. A stale quote is refreshed, never silently repriced.</small>
    </form>
  );
}

function ForecastPanel({ market }: { market: Market }) {
  const [choice, setChoice] = useState<BinaryOutcome>("YES");
  const [pending, setPending] = useState(false);
  const wallet = useAppStore((state) => state.wallet);
  const notify = useAppStore((state) => state.notify);
  async function submit() {
    setPending(true);
    try {
      const result = await submitAction({ endpoint: `/markets/${market.id}/opening-forecasts`, payload: { outcome: choice, signed_by: wallet.address }, walletName: wallet.name });
      notify({ tone: "success", title: result.simulated ? "Demo forecast recorded" : "Forecast signed", description: `${choice} · no funds committed · ${market.openingForecast.count + 1}/100` });
    } catch (error) { notify({ tone: "error", title: "Forecast rejected", description: error instanceof Error ? error.message : "Could not sign forecast." }); }
    finally { setPending(false); }
  }
  return (
    <div className="action-panel"><span className="eyebrow">Free opening forecast</span><h2>Help discover the price.</h2><p>No funds are committed. One payment credential can sign one YES or NO forecast for this market.</p><div className="side-picker"><button type="button" className={choice === "YES" ? "yes active" : "yes"} onClick={() => setChoice("YES")}>YES <Check size={16} /></button><button type="button" className={choice === "NO" ? "no active" : "no"} onClick={() => setChoice("NO")}>NO <Check size={16} /></button></div><button type="button" className="button primary w-full" onClick={() => void submit()} disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" /> Signing</> : <>Sign {choice} forecast <ArrowRight size={17} /></>}</button><small className="action-note"><Info size={13} /> Result remains hidden as a market price until all 100 forecasts are committed.</small></div>
  );
}
