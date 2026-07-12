import { useQuery } from "@tanstack/react-query";

import {
  apiDeploymentStatus,
  apiDrafts,
  apiLeaderboard,
  apiLiquidity,
  apiMarket,
  apiMarkets,
  apiPortfolio,
  apiSimulation,
} from "@/lib/api";
import { CONFIG } from "@/lib/config";
import {
  demoAdminDrafts,
  demoDeploymentStatus,
  demoLeaderboard,
  demoLiquidity,
  demoMarkets,
  demoPortfolio,
  demoSimulation,
} from "@/data/demo";
import { useAppStore } from "@/store/app-store";

async function withFallback<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    const result = await load();
    useAppStore.getState().setDataMode("api");
    return result;
  } catch (error) {
    if (!CONFIG.demoFallback) throw error;
    useAppStore.getState().setDataMode("demo");
    return fallback;
  }
}

export function useMarkets() {
  return useQuery({
    queryKey: ["markets"],
    queryFn: () => withFallback(apiMarkets, demoMarkets),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function useMarket(id: string | undefined) {
  const fallback = demoMarkets.find((market) => market.id === id);
  return useQuery({
    queryKey: ["market", id],
    queryFn: async () => {
      if (!id) throw new Error("Market id is missing.");
      if (!fallback && !CONFIG.apiUrl) throw new Error("Market not found.");
      return withFallback(() => apiMarket(id), fallback!);
    },
    enabled: Boolean(id),
    staleTime: 8_000,
    refetchInterval: 15_000,
  });
}

export function useLiquidity(marketId: string | undefined) {
  const fallback = demoLiquidity.find((item) => item.marketId === marketId);
  return useQuery({
    queryKey: ["liquidity", marketId],
    queryFn: async () => {
      if (!marketId) throw new Error("Market id is missing.");
      if (!fallback && !CONFIG.apiUrl) throw new Error("Liquidity state not found.");
      return withFallback(() => apiLiquidity(marketId), fallback!);
    },
    enabled: Boolean(marketId),
    staleTime: 10_000,
  });
}

export function usePortfolio() {
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: () => withFallback(apiPortfolio, demoPortfolio),
    staleTime: 10_000,
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => withFallback(apiLeaderboard, demoLeaderboard),
    staleTime: 30_000,
  });
}

export function useSimulation() {
  return useQuery({
    queryKey: ["simulation"],
    queryFn: () => withFallback(apiSimulation, demoSimulation),
    refetchInterval: 5_000,
  });
}

export function useDeploymentStatus() {
  return useQuery({
    queryKey: ["deployment-status"],
    queryFn: () => withFallback(apiDeploymentStatus, demoDeploymentStatus),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useAdminDrafts() {
  return useQuery({
    queryKey: ["admin-drafts"],
    queryFn: () => withFallback(apiDrafts, demoAdminDrafts),
    staleTime: 10_000,
  });
}
