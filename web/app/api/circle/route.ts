import { NextResponse } from "next/server";
import { decodeEventLog, type Hex } from "viem";
import { focusBondAbi } from "@/lib/abi";
import { focusBondAddress, publicClient } from "@/lib/chain";

/** Server-side circle read — keeps browser off the rate-limited public RPC. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idRaw = searchParams.get("id");
    const address = searchParams.get("address") as Hex | null;

    const out: Record<string, unknown> = {};

    if (address) {
      out.balance = (await publicClient.getBalance({ address })).toString();
    }

    if (idRaw && /^\d+$/.test(idRaw)) {
      const id = BigInt(idRaw);
      const [raw, board] = await Promise.all([
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
      ]);
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

    // Optional recent logs for the feed (narrow window).
    if (searchParams.get("logs") === "1") {
      const bn = await publicClient.getBlockNumber();
      const from = bn > 60n ? bn - 60n : 0n;
      const logs = await publicClient.getLogs({
        address: focusBondAddress,
        fromBlock: from,
        toBlock: bn,
      });
      const feed = [];
      for (const log of logs) {
        try {
          const ev = decodeEventLog({ abi: focusBondAbi, data: log.data, topics: log.topics });
          feed.push({
            key: `${log.transactionHash}-${log.logIndex}`,
            name: ev.eventName,
            args: serializeArgs(ev.args as Record<string, unknown>),
            hash: log.transactionHash,
          });
        } catch {
          /* skip */
        }
      }
      out.feed = feed.reverse().slice(0, 30);
    }

    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message.split("\n")[0] }, { status: 500 });
  }
}

function serializeArgs(args: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = typeof v === "bigint" ? v.toString() : Array.isArray(v) ? v.map((x) => (typeof x === "bigint" ? x.toString() : x)) : v;
  }
  return out;
}
