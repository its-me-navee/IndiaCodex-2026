import { CheckCircle2, ExternalLink, Info, X, XCircle } from "lucide-react";

import { CONFIG } from "@/lib/config";
import { shortHash } from "@/lib/format";
import { useAppStore } from "@/store/app-store";

export function ToastTray() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);
  return (
    <div className="fixed bottom-4 right-4 z-[80] flex w-[min(390px,calc(100vw-32px))] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? XCircle : Info;
        return (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            <Icon className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1"><strong>{toast.title}</strong>{toast.description && <p>{toast.description}</p>}{toast.txHash && <a href={`${CONFIG.explorerUrl}/transaction/${toast.txHash}`} target="_blank" rel="noreferrer">{shortHash(toast.txHash, 12, 8)} <ExternalLink size={12} /></a>}</div>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss"><X size={15} /></button>
          </div>
        );
      })}
    </div>
  );
}
