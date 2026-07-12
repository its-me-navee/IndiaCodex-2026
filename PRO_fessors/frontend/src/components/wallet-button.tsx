import {
  ConnectWalletButton,
  useCardano,
} from "@cardano-foundation/cardano-connect-with-wallet";
import { NetworkType } from "@cardano-foundation/cardano-connect-with-wallet-core";
import { useEffect } from "react";

import { lovelaceToAda } from "@/lib/format";
import { useAppStore } from "@/store/app-store";

export function WalletSynchronizer() {
  const cardano = useCardano({ limitNetwork: NetworkType.TESTNET });
  const setWallet = useAppStore((state) => state.setWallet);

  useEffect(() => {
    const address = cardano.usedAddresses?.[0] ?? cardano.unusedAddresses?.[0] ?? null;
    setWallet({
      connected: cardano.isConnected,
      connecting: cardano.isConnecting,
      name: cardano.enabledWallet ?? null,
      address,
      balanceAda:
        cardano.accountBalance == null
          ? null
          : lovelaceToAda(String(cardano.accountBalance)),
      networkId: cardano.isConnected ? 0 : null,
    });
  }, [
    cardano.accountBalance,
    cardano.enabledWallet,
    cardano.isConnected,
    cardano.isConnecting,
    cardano.unusedAddresses,
    cardano.usedAddresses,
    setWallet,
  ]);
  return null;
}

export function WalletButton() {
  const notify = useAppStore((state) => state.notify);
  return (
    <div className="probx-wallet-button">
      <ConnectWalletButton
        label="Connect wallet"
        limitNetwork={NetworkType.TESTNET}
        supportedWallets={["Eternl", "Nami", "Lace", "Yoroi", "Vespr"]}
        primaryColor="#b9f66b"
        borderRadius={10}
        showAccountBalance
        onConnectError={(_, error) =>
          notify({ tone: "error", title: "Wallet connection failed", description: String(error) })
        }
      />
    </div>
  );
}
