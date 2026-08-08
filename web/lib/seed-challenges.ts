/** Open lobby challenges seeded for the demo. Codes are separate from friend codes. */
export const SEED_CHALLENGES = [
  {
    code: "GYM2X",
    host: "bob",
    label: "Gym Streak",
    goal: "Gym Streak: workout photo before the deadline",
    stakeMon: "0.01",
    roundSeconds: 20,
    challengeSeconds: 20,
  },
  {
    code: "JOBS3",
    host: "cara",
    label: "Job Hunt Sprint",
    goal: "Job Hunt Sprint: apply to 5 jobs; screenshot each sent email",
    stakeMon: "0.01",
    roundSeconds: 20,
    challengeSeconds: 20,
  },
  {
    code: "CODE4",
    host: "alice",
    label: "LeetCode Daily",
    goal: "LeetCode Daily: one accepted submission",
    stakeMon: "0.01",
    roundSeconds: 20,
    challengeSeconds: 20,
  },
] as const;

export type SeedChallenge = (typeof SEED_CHALLENGES)[number];

export function seedByCode(raw: string) {
  const code = raw.trim().replace(/^#/, "").toUpperCase();
  return SEED_CHALLENGES.find((c) => c.code === code) ?? null;
}
