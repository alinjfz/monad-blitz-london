export const PRESETS = [
  {
    id: "gym",
    label: "Gym Streak",
    goal: "Workout photo before the deadline",
    proof: "Live gym photo",
    round: 20,
    challenge: 15,
    stakeMon: "0.02",
  },
  {
    id: "jobs",
    label: "Job Hunt Sprint",
    goal: "Apply to 5 jobs — screenshot each sent email",
    proof: "Email screenshots",
    round: 20,
    challenge: 15,
    stakeMon: "0.03",
  },
  {
    id: "leetcode",
    label: "LeetCode Daily",
    goal: "One accepted submission",
    proof: "Accepted submission screenshot",
    round: 20,
    challenge: 15,
    stakeMon: "0.02",
  },
  {
    id: "offtiktok",
    label: "Off TikTok",
    goal: "Under 30 minutes of short-form video",
    proof: "Screen time report",
    round: 20,
    challenge: 15,
    stakeMon: "0.02",
  },
  {
    id: "thesis",
    label: "Thesis Hours",
    goal: "Two hours of writing — screenshot the word count",
    proof: "Word count screenshot",
    round: 20,
    challenge: 15,
    stakeMon: "0.03",
  },
  {
    id: "custom",
    label: "Add your own",
    goal: "Describe your challenge",
    proof: "Whatever proves you did it",
    round: 20,
    challenge: 15,
    stakeMon: "0.02",
  },
] as const;

export type Preset = (typeof PRESETS)[number];

export const DEFAULT_ROUND_SECONDS = 20;
export const DEFAULT_CHALLENGE_SECONDS = 15;
