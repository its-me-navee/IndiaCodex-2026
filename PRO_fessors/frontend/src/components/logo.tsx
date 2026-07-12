import { Link } from "react-router-dom";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5" aria-label="ProbX home">
      <span className="relative grid size-9 place-items-center rounded-xl border border-lime/30 bg-lime/10">
        <span className="absolute h-0.5 w-5 rotate-45 bg-lime" />
        <span className="absolute h-0.5 w-5 -rotate-45 bg-lime" />
        <span className="size-1.5 rounded-full bg-ink shadow-[0_0_10px_#b9f66b]" />
      </span>
      {!compact && (
        <span className="font-display text-xl font-bold tracking-[-0.06em]">
          Prob<span className="text-lime">X</span>
        </span>
      )}
    </Link>
  );
}
