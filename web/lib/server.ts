import "server-only";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "./chain";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet-rpc.monad.xyz";

/// Demo wallets live server side only, so no private key is ever shipped to the
/// browser. The UI asks the server to act as Alice, Bob, or Cara.
const KEYS: Record<string, string | undefined> = {
  ALICE: process.env.ALICE_PK,
  BOB: process.env.BOB_PK,
  CARA: process.env.CARA_PK,
};

export function actorAccount(actor: string) {
  const key = KEYS[actor];
  if (!key) throw new Error(`no key configured for actor ${actor}`);
  return privateKeyToAccount(key as Hex);
}

export function actorWallet(actor: string) {
  return createWalletClient({
    account: actorAccount(actor),
    chain: monadTestnet,
    transport: http(rpcUrl),
  });
}

export function refereeAccount() {
  const key = process.env.REFEREE_PK;
  if (!key) throw new Error("REFEREE_PK is not set");
  return privateKeyToAccount(key as Hex);
}
