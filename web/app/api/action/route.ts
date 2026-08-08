import { NextResponse } from "next/server";
import { encodeFunctionData, type Abi } from "viem";
import { focusBondAddress, publicClient } from "@/lib/chain";
import { focusBondAbi } from "@/lib/abi";
import { actorWallet } from "@/lib/server";

/// Monad charges gas on the limit rather than on usage, so a padded limit is
/// money actually spent, not just headroom. These come from `forge test
/// --gas-report` measured maximums, with enough margin for a full 8-member
/// circle. Overpadding here cost real MON in early Testnet runs.
const GAS_LIMIT: Record<string, bigint> = {
  createCircle: 260_000n, // measured 184k
  join: 130_000n, // measured 80k
  start: 90_000n, // measured 36k
  submitProof: 90_000n, // measured 53k
  breakFocus: 85_000n, // measured 50k
  attest: 110_000n, // measured 61k
  challenge: 100_000n, // measured 56k
  nudge: 60_000n,
  abort: 260_000n, // measured 75k at 2 members, scales with member count
  settle: 700_000n, // measured 251k at 3 members, scales with member count
};

const ALLOWED = new Set(Object.keys(GAS_LIMIT));

export async function POST(req: Request) {
  try {
    const { actor, fn, args = [], value } = await req.json();

    if (!ALLOWED.has(fn)) {
      return NextResponse.json({ error: `function ${fn} is not allowed` }, { status: 400 });
    }

    const wallet = actorWallet(actor);
    const data = encodeFunctionData({
      abi: focusBondAbi as Abi,
      functionName: fn,
      args: args.map(revive),
    });
    const hash = await wallet.sendTransaction({
      to: focusBondAddress,
      data,
      value: value ? BigInt(value) : undefined,
      gas: GAS_LIMIT[fn],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return NextResponse.json({ hash, status: receipt.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Surface the revert reason to the UI; on stage a clear error beats a spinner.
    return NextResponse.json({ error: message.split("\n")[0] }, { status: 500 });
  }
}

/// JSON has no bigint, so numeric strings tagged with n arrive as "123n".
function revive(arg: unknown) {
  if (typeof arg === "string" && /^\d+n$/.test(arg)) return BigInt(arg.slice(0, -1));
  return arg;
}
