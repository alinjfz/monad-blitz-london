/** Open lobby challenges seeded for the demo. Codes are separate from friend codes. */
export const SEED_CHALLENGES = [
  {
    code: "LOCK1",
    host: "alice",
    label: "Blitz Lock-In",
    goal: "Blitz Lock-In: 60 minutes heads-down building",
    stakeMon: "0.02",
    roundSeconds: 120,
    challengeSeconds: 60,
  },
  {
    code: "GYM2X",
    host: "bob",
    label: "Gym Streak",
    goal: "Gym Streak: workout photo before the deadline",
    stakeMon: "0.02",
    roundSeconds: 120,
    challengeSeconds: 60,
  },
  {
    code: "JOBS3",
    host: "cara",
    label: "Job Hunt Sprint",
    goal: "Job Hunt Sprint: apply to 5 jobs; screenshot each sent email",
    stakeMon: "0.02",
    roundSeconds: 180,
    challengeSeconds: 60,
  },
] as const;

export type SeedChallenge = (typeof SEED_CHALLENGES)[number];

export function seedByCode(raw: string) {
  const code = raw.trim().replace(/^#/, "").toUpperCase();
  return SEED_CHALLENGES.find((c) => c.code === code) ?? null;
}
