import { apiAction } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { signAndSubmit } from "@/lib/wallet";

export interface SubmitActionInput {
  endpoint: string;
  payload: Record<string, unknown>;
  walletName?: string | null;
}

export async function submitAction({ endpoint, payload, walletName }: SubmitActionInput) {
  try {
    const response = await apiAction(endpoint, payload);
    if (response.tx_hash) return { txHash: response.tx_hash, simulated: false };
    if (response.unsigned_tx) {
      if (!walletName) throw new Error("Connect a wallet to sign this transaction.");
      return { txHash: await signAndSubmit(walletName, response.unsigned_tx), simulated: false };
    }
    return { txHash: response.transaction_id ?? "submitted-off-chain", simulated: false };
  } catch (error) {
    if (!CONFIG.demoFallback) throw error;
    await new Promise((resolve) => window.setTimeout(resolve, 850));
    const hash = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return { txHash: hash, simulated: true };
  }
}
