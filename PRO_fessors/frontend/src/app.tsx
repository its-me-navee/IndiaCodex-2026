import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/app-shell";
import { AdminPage } from "@/pages/admin-page";
import { CreatePage } from "@/pages/create-page";
import { HomePage } from "@/pages/home-page";
import { LeaderboardPage } from "@/pages/leaderboard-page";
import { LiquidityPage } from "@/pages/liquidity-page";
import { MarketDetailPage } from "@/pages/market-detail-page";
import { MarketLiquidityPage } from "@/pages/market-liquidity-page";
import { MarketsPage } from "@/pages/markets-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { PortfolioPage } from "@/pages/portfolio-page";
import { SimulationPage } from "@/pages/simulation-page";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="markets" element={<MarketsPage />} />
        <Route path="markets/:id" element={<MarketDetailPage />} />
        <Route path="markets/:id/liquidity" element={<MarketLiquidityPage />} />
        <Route path="create" element={<CreatePage />} />
        <Route path="liquidity" element={<LiquidityPage />} />
        <Route path="portfolio" element={<PortfolioPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="simulation" element={<SimulationPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}
