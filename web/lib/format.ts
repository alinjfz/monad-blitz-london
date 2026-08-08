import { formatEther, type Hex } from "viem";

export const ZERO = "0x0000000000000000000000000000000000000000";
export const ZERO_HASH = `0x${"0".repeat(64)}` as Hex;

export const mon = (v: bigint, dp = 4) => Number(formatEther(v)).toFixed(dp);
export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function fmtClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function phaseLabel(phase: string) {
  return (
    {
      none: "No active challenge",
      lobby: "Waiting for friends",
      focus: "Challenge live",
      challenge: "Dispute window",
      ready: "Ready to settle",
      settled: "Settled",
    } as Record<string, string>
  )[phase] ?? phase;
}
