import { NextResponse } from "next/server";
import { decodeEventLog, type Hex } from "viem";
import { focusBondAbi } from "@/lib/abi";
import { focusBondAddress, publicClient } from "@/lib/chain";
import { readJson, writeJson } from "@/lib/persist";
import { friendlyRpcError, withRpcRetry } from "@/lib/rpc";

type StoredFeedItem = {
  key: string;
  name: string;
  args: Record<string, unknown>;
  hash: string;
  at?: number;
};

function loadFeed(): StoredFeedItem[] {
  return readJson<StoredFeedItem[]>("feed.json", []);
}

function saveFeed(items: StoredFeedItem[]) {
  // Keep a long rolling history for the demo.
  writeJson("feed.json", items.slice(0, 200));
}

function mergeFeed(existing: StoredFeedItem[], incoming: StoredFeedItem[]) {
  const map = new Map<string, StoredFeedItem>();
  for (const item of [...existing, ...incoming]) map.set(item.key, item);
  return [...map.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

/** Server-side circle read — keeps browser off the rate-limited public RPC. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idRaw = searchParams.get("id");
    const address = searchParams.get("address") as Hex | null;

    const out: Record<string, unknown> = {};

    if (address) {
      try {
        out.balance = (
          await withRpcRetry(() => publicClient.getBalance({ address }))
        ).toString();
      } catch {
        /* keep UI usable without balance */
      }
    }

    if (idRaw && /^\d+$/.test(idRaw)) {
      const id = BigInt(idRaw);
      const [raw, board] = await withRpcRetry(() =>
        Promise.all([
          publicClient.readContract({
            address: focusBondAddress,
            abi: focusBondAbi,
            functionName: "getCircle",
            args: [id],
          }),
          publicClient.readContract({
            address: focusBondAddress,
            abi: focusBondAbi,
            functionName: "getBoard",
            args: [id],
          }),
        ]),
      );
      const c = raw as readonly unknown[];
      out.circle = {
        stake: (c[0] as bigint).toString(),
        goal: c[1] as string,
        roundSeconds: (c[2] as bigint).toString(),
        challengeSeconds: (c[3] as bigint).toString(),
        endsAt: (c[4] as bigint).toString(),
        challengeEndsAt: (c[5] as bigint).toString(),
        settled: c[6] as boolean,
        members: c[7] as readonly string[],
        escrow: (c[8] as bigint).toString(),
      };
      out.board = (board as readonly Record<string, unknown>[]).map((m) => ({
        ...m,
        stats: {
          ...(m.stats as object),
          earned: String((m.stats as { earned: bigint }).earned),
          lost: String((m.stats as { lost: bigint }).lost),
        },
      }));
    }

    // Always return a persistent feed; refresh from chain when possible.
    const persisted = loadFeed();
    if (searchParams.get("logs") === "1") {
      try {
        const bn = await withRpcRetry(() => publicClient.getBlockNumber());
        const from = bn > 2_000n ? bn - 2_000n : 0n;
        const logs = await withRpcRetry(() =>
          publicClient.getLogs({
            address: focusBondAddress,
            fromBlock: from,
            toBlock: bn,
          }),
        );
        const incoming: StoredFeedItem[] = [];
        for (const log of logs) {
          try {
            const ev = decodeEventLog({ abi: focusBondAbi, data: log.data, topics: log.topics });
            incoming.push({
              key: `${log.transactionHash}-${log.logIndex}`,
              name: ev.eventName,
              args: serializeArgs(ev.args as Record<string, unknown>),
              hash: log.transactionHash!,
              at: Number(log.blockNumber ?? 0n),
            });
          } catch {
            /* skip */
          }
        }
        const merged = mergeFeed(persisted, incoming);
        saveFeed(merged);
        out.feed = merged.slice(0, 80);
      } catch {
        out.feed = persisted.slice(0, 80);
      }
    } else {
      out.feed = persisted.slice(0, 80);
    }

    return NextResponse.json(out);
  } catch (err) {
    const persisted = loadFeed();
    if (persisted.length) {
      return NextResponse.json({ feed: persisted.slice(0, 80) });
    }
    return NextResponse.json({ error: friendlyRpcError(err) }, { status: 503 });
  }
}

function serializeArgs(args: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] =
      typeof v === "bigint"
        ? v.toString()
        : Array.isArray(v)
          ? v.map((x) => (typeof x === "bigint" ? x.toString() : x))
          : v;
  }
  return out;
}
