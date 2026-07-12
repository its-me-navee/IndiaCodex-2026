import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1280px] px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1 className="page-title">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p></div>{actions && <div className="flex shrink-0 gap-2">{actions}</div>}</div>;
}

export function LoadingState({ label = "Loading live state" }: { label?: string }) {
  return <div className="state-card"><LoaderCircle className="animate-spin text-lime" /><span>{label}…</span></div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state-card border-coral/20 bg-coral/5"><AlertTriangle className="text-coral" /><div className="flex-1"><strong>Could not load this view</strong><p>{message}</p></div>{retry && <button type="button" className="button secondary" onClick={retry}><RefreshCw size={15} /> Retry</button>}</div>;
}

export function Metric({ label, value, detail, tone = "default" }: { label: string; value: ReactNode; detail?: string; tone?: "default" | "lime" | "teal" | "coral" }) {
  return <div className="metric-card"><span>{label}</span><strong className={tone === "default" ? "" : `text-${tone}`}>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: count }, (_, index) => <div className="h-[330px] animate-pulse rounded-2xl border border-line bg-panel" key={index} />)}</div>;
}
