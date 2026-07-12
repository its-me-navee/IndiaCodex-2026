import { create } from "zustand";

import type { WalletSnapshot } from "@/types";

export interface ToastMessage {
  id: number;
  tone: "success" | "error" | "info";
  title: string;
  description?: string;
  txHash?: string;
}

interface AppState {
  mobileNavOpen: boolean;
  dataMode: "api" | "demo" | "checking";
  wallet: WalletSnapshot;
  toasts: ToastMessage[];
  setMobileNavOpen: (open: boolean) => void;
  setDataMode: (mode: AppState["dataMode"]) => void;
  setWallet: (wallet: Partial<WalletSnapshot>) => void;
  notify: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: number) => void;
}

const emptyWallet: WalletSnapshot = {
  connected: false,
  connecting: false,
  name: null,
  address: null,
  balanceAda: null,
  networkId: null,
};

export const useAppStore = create<AppState>((set) => ({
  mobileNavOpen: false,
  dataMode: "checking",
  wallet: emptyWallet,
  toasts: [],
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setDataMode: (dataMode) => set({ dataMode }),
  setWallet: (wallet) => set((state) => ({ wallet: { ...state.wallet, ...wallet } })),
  notify: (toast) => {
    const id = Date.now() + Math.round(Math.random() * 1_000);
    set((state) => ({ toasts: [...state.toasts.slice(-3), { ...toast, id }] }));
    window.setTimeout(
      () => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
      5_500,
    );
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}));
