import { ArrowRight, Info, LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";

import { submitAction } from "@/lib/actions";
import { formatAda } from "@/lib/format";
import { buildCashOutQuote } from "@/lib/market-math";
import { useAppStore } from "@/store/app-store";
import type { Position } from "@/types";

export function CashOutCard({ position }: { position: Position }) {
  const [pending, setPending] = useState(false);
  const wallet = useAppStore((state) => state.wallet);
  const notify = useAppStore((state) => state.notify);
  const quote = buildCashOutQuote(position.outcome, position.shares, position.currentProbability, position.amountPaidAda);
  async function cashOut() {
    setPending(true);
    try {
      const result = await submitAction({ endpoint: `/positions/${position.id}/cashout-payload`, payload: { full_position: true, expected_proceeds_lovelace: Math.round(quote.proceedsAda * 1_000_000) }, walletName: wallet.name });
      notify({ tone: "success", title: result.simulated ? "Demo cash-out complete" : "Cash-out submitted", description: `Entire ${position.outcome} position · ${formatAda(quote.proceedsAda, 2)} tADA proceeds`, txHash: result.txHash });
    } catch (error) { notify({ tone: "error", title: "Cash-out failed", description: error instanceof Error ? error.message : "Transaction rejected." }); }
    finally { setPending(false); }
  }
  return (
    <div className="cashout-card"><div className="flex items-center justify-between"><span className="eyebrow">Your open position</span><span className={`outcome-chip ${position.outcome.toLowerCase()}`}>{position.outcome}</span></div><div className="mt-4 grid grid-cols-2 gap-3"><div><span className="data-label">Amount paid</span><strong>{formatAda(position.amountPaidAda)} ₳</strong></div><div><span className="data-label">Current estimate</span><strong>{formatAda(quote.proceedsAda, 2)} ₳</strong></div></div><div className="quote-table mt-4"><div><span>Gross curve value</span><strong>{formatAda(quote.grossAda, 2)} ₳</strong></div><div><span>LP fee · 1%</span><strong className="text-teal">−{formatAda(quote.feeAda, 2)} ₳</strong></div><div className="total"><span>Estimated P/L</span><strong className={quote.realizedPnlAda >= 0 ? "text-teal" : "text-coral"}>{quote.realizedPnlAda >= 0 ? "+" : ""}{formatAda(quote.realizedPnlAda, 2)} ₳</strong></div></div><button type="button" onClick={() => void cashOut()} disabled={pending} className="button secondary w-full">{pending ? <><LoaderCircle className="animate-spin" /> Building exit</> : <><RotateCcw size={16} /> Cash out entire position <ArrowRight size={15} /></>}</button><small className="action-note"><Info size={13} /> Phase one supports full cash-out only. This burns the complete position UTxO.</small></div>
  );
}
