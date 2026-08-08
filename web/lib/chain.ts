import { createPublicClient, defineChain, http } from "viem";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: {
    default: { name: "MonadScan", url: "https://testnet.monadscan.com" },
  },
});

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(rpcUrl),
});

export const focusBondAddress = (process.env.NEXT_PUBLIC_FOCUSBOND_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const explorerTx = (hash: string) => `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (addr: string) =>
  `${monadTestnet.blockExplorers.default.url}/address/${addr}`;

export const ACTORS = ["ALICE", "BOB", "CARA"] as const;
export type Actor = (typeof ACTORS)[number];
