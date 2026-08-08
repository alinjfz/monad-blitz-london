import type { Hex } from "viem";

export type Stats = {
  streak: number;
  bestStreak: number;
  completed: number;
  missed: number;
  earned: bigint;
  lost: bigint;
};

export type MemberView = {
  addr: Hex;
  proofHash: Hex;
  verified: boolean;
  failedByAI: boolean;
  broke: boolean;
  challenger: Hex;
  completer: boolean;
  stats: Stats;
};

export type Circle = {
  stake: bigint;
  goal: string;
  roundSeconds: bigint;
  challengeSeconds: bigint;
  endsAt: bigint;
  challengeEndsAt: bigint;
  settled: boolean;
  members: readonly Hex[];
  escrow: bigint;
};

export type FeedItem = { key: string; name: string; text: string; hash: Hex };
export type Verdict = { pass: boolean | null; reason: string; source: string };
export type Phase = "none" | "lobby" | "focus" | "challenge" | "ready" | "settled";
