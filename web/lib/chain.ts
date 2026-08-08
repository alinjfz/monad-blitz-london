import { createPublicClient, defineChain, http } from "viem";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz";

/** Deployed FocusBond on Monad Testnet. */
export const DEPLOYED_FOCUSBOND = "0x35059ddeB46e8b91b2860c16f71D9E4a0225c578" as const;

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
  transport: http(rpcUrl, {
    batch: true,
    retryCount: 3,
    retryDelay: 800,
    timeout: 25_000,
  }),
});

export const focusBondAddress = (process.env.NEXT_PUBLIC_FOCUSBOND_ADDRESS ||
  DEPLOYED_FOCUSBOND) as `0x${string}`;

export const explorerTx = (hash: string) => `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (addr: string) =>
  `${monadTestnet.blockExplorers.default.url}/address/${addr}`;

export const FAUCET_URL = "https://faucet.monad.xyz";
export const RPC_URL = rpcUrl;

/** Kept for server demo routes; the UI no longer uses these. */
export const ACTORS = ["ALICE", "BOB", "CARA"] as const;
export type Actor = (typeof ACTORS)[number];

export const GAS_LIMIT = {
  createCircle: 260_000n,
  join: 130_000n,
  start: 90_000n,
  submitProof: 90_000n,
  breakFocus: 85_000n,
  attest: 110_000n,
  challenge: 100_000n,
  nudge: 60_000n,
  abort: 260_000n,
  settle: 700_000n,
} as const;
