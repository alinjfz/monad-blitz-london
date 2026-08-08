import { NextResponse } from "next/server";
import { decodeEventLog, encodeFunctionData, type Abi } from "viem";
import { focusBondAddress, publicClient } from "@/lib/chain";
import { focusBondAbi } from "@/lib/abi";
import { actorWallet } from "@/lib/server";

const GAS_LIMIT: Record<string, bigint> = {
  createCircle: 320_000n,
  join: 150_000n,
  start: 90_000n,
  submitProof: 90_000n,
  breakFocus: 85_000n,
  attest: 110_000n,
  challenge: 100_000n,
  nudge: 60_000n,
  abort: 260_000n,
  settle: 700_000n,
};

const ALLOWED = new Set(Object.keys(GAS_LIMIT));

export async function POST(req: Request) {
  try {
    const { actor, fn, args = [], value } = await req.json();

    if (!ALLOWED.has(fn)) {
      return NextResponse.json({ error: `function ${fn} is not allowed` }, { status: 400 });
    }

    const wallet = actorWallet(actor);
    const revived = args.map(revive);
    const data = encodeFunctionData({
      abi: focusBondAbi as Abi,
      functionName: fn,
      args: revived,
    });
    const txValue = value ? BigInt(value) : undefined;

    try {
      await publicClient.call({
        account: wallet.account.address,
        to: focusBondAddress,
        data,
        value: txValue,
      });
    } catch (simErr) {
      const raw = simErr instanceof Error ? simErr.message : String(simErr);
      const bal = await publicClient.getBalance({ address: wallet.account.address });
      if (txValue !== undefined && bal < txValue) {
        return NextResponse.json(
          {
            error: `Not enough MON. Wallet has ${(Number(bal) / 1e18).toFixed(3)} MON but needs ${(Number(txValue) / 1e18).toFixed(3)} + gas.`,
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: raw.split("\n")[0].slice(0, 220) || "simulation failed" },
        { status: 400 },
      );
    }

    const hash = await wallet.sendTransaction({
      to: focusBondAddress,
      data,
      value: txValue,
      gas: GAS_LIMIT[fn],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") {
      return NextResponse.json(
        {
          error: "transaction reverted onchain — check stake + gas vs wallet balance, then retry.",
        },
        { status: 500 },
      );
    }

    let circleId: string | undefined;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: focusBondAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "CircleCreated") {
          circleId = String((ev.args as { id: bigint }).id);
        }
        if (ev.eventName === "Joined" || ev.eventName === "Started") {
          circleId ??= String((ev.args as { id?: bigint }).id ?? "");
        }
      } catch {
        /* not our event */
      }
    }

    return NextResponse.json({
      hash,
      status: receipt.status,
      circleId: circleId || undefined,
      balance: (await publicClient.getBalance({ address: wallet.account.address })).toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message.split("\n")[0] }, { status: 500 });
  }
}

function revive(arg: unknown) {
  if (typeof arg === "string" && /^\d+n$/.test(arg)) return BigInt(arg.slice(0, -1));
  return arg;
}
