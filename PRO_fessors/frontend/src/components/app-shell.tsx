import {
  Activity,
  BarChart3,
  Beaker,
  Droplets,
  LayoutDashboard,
  Menu,
  Plus,
  ShieldCheck,
  Trophy,
  WalletCards,
  X,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { Logo } from "@/components/logo";
import { WalletButton } from "@/components/wallet-button";
import { ToastTray } from "@/components/toast-tray";
import { shortHash } from "@/lib/format";
import { useAppStore } from "@/store/app-store";

const primary = [
  { to: "/markets", label: "Markets", icon: BarChart3 },
  { to: "/liquidity", label: "Liquidity", icon: Droplets },
  { to: "/portfolio", label: "Portfolio", icon: WalletCards },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

const secondary = [
  { to: "/simulation", label: "Simulation", icon: Beaker },
  { to: "/admin", label: "Admin", icon: ShieldCheck },
];

function NavItems({ onSelect }: { onSelect?: () => void }) {
  return (
    <>
      {primary.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} onClick={onSelect} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          <Icon size={16} /> {label}
        </NavLink>
      ))}
      <span className="mx-1 hidden h-5 w-px bg-line xl:block" />
      {secondary.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} onClick={onSelect} className={({ isActive }) => `nav-link subtle ${isActive ? "active" : ""}`}>
          <Icon size={15} /> {label}
        </NavLink>
      ))}
    </>
  );
}

export function AppShell() {
  const open = useAppStore((state) => state.mobileNavOpen);
  const setOpen = useAppStore((state) => state.setMobileNavOpen);
  const mode = useAppStore((state) => state.dataMode);
  const wallet = useAppStore((state) => state.wallet);
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-50 border-b border-line bg-canvas/88 backdrop-blur-xl">
        <div className="mx-auto flex h-[70px] max-w-[1440px] items-center gap-7 px-4 sm:px-6">
          <Logo />
          <nav className="mr-auto hidden items-center gap-1 lg:flex"><NavItems /></nav>
          <div className="flex items-center gap-2.5">
            <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[.12em] sm:flex ${mode === "api" ? "border-teal/20 bg-teal/8 text-teal" : "border-amber/20 bg-amber/8 text-amber"}`}>
              <i className="size-1.5 rounded-full bg-current shadow-[0_0_7px_currentColor]" />
              {mode === "api" ? "API live" : mode === "demo" ? "Demo data" : "Syncing"}
            </span>
            {wallet.connected && wallet.address && (
              <span className="hidden rounded-lg border border-line bg-panel px-2.5 py-2 font-mono text-[10px] text-muted xl:block">
                {shortHash(wallet.address)}
              </span>
            )}
            <NavLink to="/create" className="button primary hidden md:inline-flex"><Plus size={16} /> Create</NavLink>
            <div className="hidden sm:block"><WalletButton /></div>
            <button type="button" className="icon-button lg:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X /> : <Menu />}</button>
          </div>
        </div>
        {open && (
          <div className="border-t border-line bg-panel p-4 lg:hidden">
            <nav className="grid gap-1"><NavItems onSelect={() => setOpen(false)} /></nav>
            <NavLink to="/create" onClick={() => setOpen(false)} className="button primary mt-3 w-full"><Plus size={16} /> Create market</NavLink>
            <div className="mt-3 sm:hidden"><WalletButton /></div>
          </div>
        )}
      </header>
      <main><Outlet /></main>
      <footer className="border-t border-line bg-panel/60">
        <div className="mx-auto flex min-h-20 max-w-[1280px] flex-col items-center justify-between gap-2 px-5 py-5 text-[11px] text-dim sm:flex-row">
          <span className="flex items-center gap-2"><Logo compact /> <strong className="text-muted">ProbX</strong> · transparent custody on Cardano</span>
          <span className="flex items-center gap-2"><Activity size={14} className="text-teal" /> Preprod testnet · test ADA only · unaudited</span>
        </div>
      </footer>
      <ToastTray />
    </div>
  );
}
