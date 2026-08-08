"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { http, WagmiProvider, createConfig, createConnector, type CreateConnectorFn } from "wagmi";
import type { Address } from "viem";
import { monadTestnet, RPC_URL } from "@/lib/chain";

/** Minimal EIP-1193 injected connector — avoids wagmi/connectors barrel (Coinbase/x402). */
const browserWallet: CreateConnectorFn = createConnector((config) => {
  const connector = {
    id: "injected",
    name: "Browser Wallet",
    type: "injected" as const,
    async setup() {
      if (typeof window === "undefined") return;
      const eth = (window as Window & { ethereum?: EthereumProvider }).ethereum;
      eth?.on?.("accountsChanged", ((accounts: string[]) => {
        config.emitter.emit("change", { accounts: accounts as Address[] });
      }) as never);
      eth?.on?.("chainChanged", (() => {
        config.emitter.emit("change", {});
      }) as never);
    },
    async connect({ chainId }: { chainId?: number } = {}) {
      const provider = await connector.getProvider();
      if (!provider) throw new Error("No browser wallet found. Install MetaMask or Rabby.");
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
      let currentChainId = await connector.getChainId();
      if (chainId && currentChainId !== chainId) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${chainId.toString(16)}` }],
          });
          currentChainId = chainId;
        } catch {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${chainId.toString(16)}`,
                chainName: monadTestnet.name,
                nativeCurrency: monadTestnet.nativeCurrency,
                rpcUrls: [RPC_URL],
                blockExplorerUrls: [monadTestnet.blockExplorers.default.url],
              },
            ],
          });
          currentChainId = chainId;
        }
      }
      return { accounts, chainId: currentChainId };
    },
    async disconnect() {
      config.emitter.emit("disconnect");
    },
    async getAccounts() {
      const provider = await connector.getProvider();
      if (!provider) return [];
      return (await provider.request({ method: "eth_accounts" })) as Address[];
    },
    async getChainId() {
      const provider = await connector.getProvider();
      if (!provider) return monadTestnet.id;
      const id = (await provider.request({ method: "eth_chainId" })) as string;
      return Number.parseInt(id, 16);
    },
    async getProvider() {
      if (typeof window === "undefined") return undefined;
      return (window as Window & { ethereum?: EthereumProvider }).ethereum;
    },
    async isAuthorized() {
      const accounts = await connector.getAccounts();
      return accounts.length > 0;
    },
    onAccountsChanged(accounts: string[]) {
      if (accounts.length === 0) config.emitter.emit("disconnect");
      else config.emitter.emit("change", { accounts: accounts as Address[] });
    },
    onChainChanged(chain: string) {
      config.emitter.emit("change", { chainId: Number.parseInt(chain, 16) });
    },
    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  };
  return connector as never;
});

type EthereumProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
};

const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [browserWallet],
  transports: {
    [monadTestnet.id]: http(RPC_URL, { batch: true, retryCount: 2, retryDelay: 1000 }),
  },
  ssr: true,
});

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
