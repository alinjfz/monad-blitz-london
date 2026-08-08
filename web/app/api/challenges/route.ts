import { NextResponse } from "next/server";
import {
  decodeEventLog,
  encodeFunctionData,
  parseEther,
  type Abi,
} from "viem";
import { focusBondAbi } from "@/lib/abi";
import { focusBondAddress, publicClient } from "@/lib/chain";
import { friendByUsername } from "@/lib/friends";
import { friendlyRpcError, withRpcRetry } from "@/lib/rpc";
import { SEED_CHALLENGES, seedByCode } from "@/lib/seed-challenges";
import { actorWallet } from "@/lib/server";

/** seed code → onchain circle id */
const circleByCode = new Map<string, string>();

const CREATE_GAS = 320_000n;

async function ensureSeed(code: string) {
  const seed = seedByCode(code);
  if (!seed) return { error: "unknown seed code" as const };

  const existing = circleByCode.get(seed.code);
  if (existing) {
    try {
      const raw = await withRpcRetry(() =>
        publicClient.readContract({
          address: focusBondAddress,
          abi: focusBondAbi,
          functionName: "getCircle",
          args: [BigInt(existing)],
        }),
      );
      const c = raw as readonly unknown[];
      const stake = c[0] as bigint;
      const settled = c[6] as boolean;
      const endsAt = c[4] as bigint;
      if (stake > 0n && !settled && endsAt === 0n) {
        return { seed, circleId: existing };
      }
    } catch {
      /* recreate below */
    }
  }

  const host = friendByUsername(seed.host);
  if (!host) return { error: "unknown host" as const };

  const wallet = actorWallet(host.actor);
  const stake = parseEther(seed.stakeMon);
  let bal: bigint;
  try {
    bal = await withRpcRetry(() => publicClient.getBalance({ address: wallet.account.address }));
  } catch {
    return { seed, error: "Network busy — tap Open again in a second." };
  }
  // Stake + small gas buffer — undelegated demo wallets can empty below 10 MON.
  if (bal < stake + parseEther("0.05")) {
    return {
      seed,
      error: `${host.displayName} needs ~${seed.stakeMon} MON + gas to open ${seed.code}. Has ${(Number(bal) / 1e18).toFixed(3)} MON.`,
    };
  }

  const data = encodeFunctionData({
    abi: focusBondAbi as Abi,
    functionName: "createCircle",
    args: [stake, seed.goal, BigInt(seed.roundSeconds), BigInt(seed.challengeSeconds)],
  });

  try {
    const hash = await withRpcRetry(() =>
      wallet.sendTransaction({
        to: focusBondAddress,
        data,
        value: stake,
        gas: CREATE_GAS,
      }),
    );
    const receipt = await withRpcRetry(() => publicClient.waitForTransactionReceipt({ hash }));
    if (receipt.status === "reverted") {
      return { seed, error: `failed to open ${seed.code} onchain` };
    }

    let circleId: string | undefined;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: focusBondAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "CircleCreated") {
          circleId = String((ev.args as { id: bigint }).id);
        }
      } catch {
        /* skip */
      }
    }
    if (!circleId) return { seed, error: "created but no circle id in receipt" };

    circleByCode.set(seed.code, circleId);
    return { seed, circleId, hash };
  } catch (err) {
    return { seed, error: friendlyRpcError(err) };
  }
}

async function describe(code: string, circleId: string | undefined) {
  const seed = seedByCode(code)!;
  const host = friendByUsername(seed.host);
  const base = {
    code: seed.code,
    label: seed.label,
    goal: seed.goal,
    stakeMon: seed.stakeMon,
    host: seed.host,
    hostName: host?.displayName ?? seed.host,
    hostFriendCode: host?.code ?? null,
    circleId: circleId ?? null,
    members: 0,
    open: false,
  };
  if (!circleId) return base;
  try {
    const raw = await withRpcRetry(() =>
      publicClient.readContract({
        address: focusBondAddress,
        abi: focusBondAbi,
        functionName: "getCircle",
        args: [BigInt(circleId)],
      }),
    );
    const c = raw as readonly unknown[];
    const stake = c[0] as bigint;
    const settled = c[6] as boolean;
    const endsAt = c[4] as bigint;
    const members = c[7] as readonly string[];
    return {
      ...base,
      members: members.length,
      open: stake > 0n && !settled && endsAt === 0n,
    };
  } catch {
    return base;
  }
}

export async function GET() {
  const challenges = [];
  for (const seed of SEED_CHALLENGES) {
    challenges.push(await describe(seed.code, circleByCode.get(seed.code)));
  }
  return NextResponse.json({ challenges });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body.action ?? "resolve");
    const code = String(body.code ?? "");

    if (action === "ensure-all") {
      const results = [];
      for (const seed of SEED_CHALLENGES) {
        results.push(await ensureSeed(seed.code));
      }
      const challenges = [];
      for (const seed of SEED_CHALLENGES) {
        challenges.push(await describe(seed.code, circleByCode.get(seed.code)));
      }
      return NextResponse.json({ challenges, results });
    }

    if (action === "resolve" || action === "open") {
      const seed = seedByCode(code);
      if (!seed) {
        return NextResponse.json({ error: "Unknown challenge code" }, { status: 404 });
      }
      const opened = await ensureSeed(seed.code);
      if ("error" in opened && opened.error && !opened.circleId) {
        return NextResponse.json({ error: opened.error, seed }, { status: 400 });
      }
      return NextResponse.json({
        code: seed.code,
        circleId: opened.circleId,
        seed,
      });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: friendlyRpcError(err) }, { status: 503 });
  }
}
