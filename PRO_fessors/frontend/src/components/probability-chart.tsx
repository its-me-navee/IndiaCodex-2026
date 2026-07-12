import type { ChartPoint } from "@/types";

export function ProbabilityChart({ points, height = 260 }: { points: ChartPoint[]; height?: number }) {
  if (points.length < 2) return <div className="grid place-items-center rounded-xl border border-dashed border-line text-xs text-dim" style={{ height }}>Chart begins when trading opens.</div>;
  const width = 900;
  const padding = 18;
  const path = points.map((point, index) => {
    const x = padding + (index / (points.length - 1)) * (width - padding * 2);
    const y = padding + (1 - point.probability) * (height - padding * 2);
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = points.at(-1)!;
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-void/60" style={{ height }}>
      <div className="absolute inset-0 chart-grid" />
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
        <defs><linearGradient id="chartArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b9f66b" stopOpacity=".22" /><stop offset="100%" stopColor="#b9f66b" stopOpacity="0" /></linearGradient></defs>
        <path d={`${path} L${width - padding},${height - padding} L${padding},${height - padding} Z`} fill="url(#chartArea)" />
        <path d={path} fill="none" stroke="#b9f66b" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute right-3 top-3 rounded-md border border-lime/20 bg-lime/10 px-2 py-1 font-mono text-xs font-bold text-lime">{Math.round(last.probability * 100)}%</div>
      <span className="absolute bottom-2 left-3 text-[9px] uppercase tracking-widest text-dim">30 hour probability</span>
    </div>
  );
}
