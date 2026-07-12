import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CalendarClock, CheckCircle2, FileCheck2, Info, LoaderCircle, Send, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { PageContainer } from "@/components/ui";
import { submitAction } from "@/lib/actions";
import { formatDate } from "@/lib/format";
import { useAppStore } from "@/store/app-store";

const schema = z.object({
  statement: z.string().min(18, "Use a complete, objective statement.").max(180),
  category: z.string().min(1),
  tradingDeadline: z.string().min(1),
  resolutionDeadline: z.string().min(1),
  yesRule: z.string().min(30, "Define the exact YES condition.").max(500),
  primarySource: z.string().min(5),
  backupSource: z.string().min(5),
  invalidRule: z.string().min(20, "Explain when the market must be voided."),
}).refine((value) => new Date(value.resolutionDeadline) > new Date(value.tradingDeadline), { message: "Resolution must follow trading close.", path: ["resolutionDeadline"] });

type FormValues = z.infer<typeof schema>;
const inputDate = (days: number) => {
  const value = new Date(Date.now() + days * 86_400_000);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function CreatePage() {
  const [pending, setPending] = useState(false);
  const wallet = useAppStore((state) => state.wallet);
  const notify = useAppStore((state) => state.notify);
  const { register, watch, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      statement: "Will ADA trade at or above $1.25 before 31 December 2026?",
      category: "Crypto",
      tradingDeadline: inputDate(45),
      resolutionDeadline: inputDate(46),
      yesRule: "The ADA/USD spot price reaches or exceeds $1.25 on the primary source at any observed minute before the trading deadline.",
      primarySource: "CoinGecko ADA/USD historical market chart",
      backupSource: "CoinMarketCap ADA/USD historical data",
      invalidRule: "VOID if neither source provides enough timestamped data to determine whether the threshold was reached.",
    },
  });
  const values = watch();
  async function submit(data: FormValues) {
    setPending(true);
    try {
      const result = await submitAction({ endpoint: "/market-drafts", payload: { statement: data.statement, category: data.category, trading_deadline: new Date(data.tradingDeadline).toISOString(), resolution_deadline: new Date(data.resolutionDeadline).toISOString(), yes_rule: data.yesRule, primary_source: data.primarySource, backup_source: data.backupSource, invalid_rule: data.invalidRule, creator: wallet.address }, walletName: wallet.name });
      notify({ tone: "success", title: result.simulated ? "Demo draft submitted" : "Draft submitted for review", description: "The statement cannot accept forecasts or funds until admin normalization and creator activation." });
    } catch (error) { notify({ tone: "error", title: "Draft not submitted", description: error instanceof Error ? error.message : "Check the form and retry." }); }
    finally { setPending(false); }
  }
  return (
    <PageContainer className="py-10 sm:py-14">
      <Link to="/markets" className="back-link"><ArrowLeft size={15} /> Market directory</Link>
      <div className="mt-7"><span className="eyebrow"><Sparkles size={12} /> Structured proposal</span><h1 className="page-title">Create an objective statement.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Drafts remain off-chain. A reviewer normalizes ambiguous terms; you approve the final version before price discovery begins.</p></div>
      <div className="mt-9 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form className="detail-card p-5 sm:p-7" onSubmit={handleSubmit(submit)}>
          <FormSection number="01" title="Statement" detail="Binary, time-bounded, and externally verifiable." />
          <label className="form-field"><span>Question / statement</span><textarea rows={3} {...register("statement")} />{errors.statement && <small className="text-coral">{errors.statement.message}</small>}<small>{values.statement?.length ?? 0}/180</small></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="form-field"><span>Category</span><select {...register("category")}>{["Crypto", "Technology", "Economics", "Sports", "Science", "Entertainment"].map((category) => <option key={category}>{category}</option>)}</select></label><label className="form-field"><span><CalendarClock size={14} /> Trading deadline</span><input type="datetime-local" {...register("tradingDeadline")} /></label></div>
          <label className="form-field"><span><CalendarClock size={14} /> Resolution deadline</span><input type="datetime-local" {...register("resolutionDeadline")} />{errors.resolutionDeadline && <small className="text-coral">{errors.resolutionDeadline.message}</small>}</label>
          <div className="form-separator" />
          <FormSection number="02" title="Resolution terms" detail="Write an objective rule the trusted admin wallet can apply mechanically with one transparent signature." />
          <label className="form-field"><span>Exact YES condition</span><textarea rows={4} {...register("yesRule")} />{errors.yesRule && <small className="text-coral">{errors.yesRule.message}</small>}</label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="form-field"><span>Primary source</span><input {...register("primarySource")} /></label><label className="form-field"><span>Backup source</span><input {...register("backupSource")} /></label></div>
          <label className="form-field"><span>Invalid / VOID rule</span><textarea rows={3} {...register("invalidRule")} />{errors.invalidRule && <small className="text-coral">{errors.invalidRule.message}</small>}</label>
          <div className="rounded-xl border border-blue/15 bg-blue/5 p-4 text-[11px] leading-5 text-muted"><Info size={16} className="mb-2 text-blue" /><strong className="block text-ink">What happens next</strong>Admin review can clarify the wording, dates, source, and invalid rule. You see and sign the normalized terms before any opening forecasts are collected.</div>
          <button className="button primary mt-5 w-full" disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" /> Submitting draft</> : <><Send size={16} /> Submit for review</>}</button>
        </form>
        <aside className="sticky top-[88px] space-y-3">
          <div className="preview-card"><span className="status-badge muted"><i /> Draft preview</span><span className="mt-5 block text-[9px] font-black uppercase tracking-[.14em] text-blue">{values.category}</span><h2>{values.statement || "Your market statement"}</h2><div className="preview-rule"><CheckCircle2 /><div><span>Resolves YES when</span><p>{values.yesRule || "Define an exact YES condition."}</p></div></div><div className="preview-meta"><FileCheck2 /><span><small>Primary source</small><strong>{values.primarySource || "Not set"}</strong></span></div><div className="preview-meta"><CalendarClock /><span><small>Trading closes</small><strong>{values.tradingDeadline ? formatDate(values.tradingDeadline) : "Not set"}</strong></span></div></div>
          <div className="detail-card p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted"><ShieldCheck size={15} className="text-teal" /> No custody at draft</div><p className="mt-2 text-[10px] leading-5 text-dim">Creating a draft does not send stake or liquidity. Funds appear only in later wallet-signed contract transactions.</p></div>
        </aside>
      </div>
    </PageContainer>
  );
}

function FormSection({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="mb-5 flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-lime/10 text-[10px] font-black text-lime">{number}</span><div><h2 className="font-display text-xl font-semibold tracking-[-.04em]">{title}</h2><p className="text-xs text-dim">{detail}</p></div></div>;
}
