import type { Actor } from "@/lib/chain";

/** Built-in friends for multi-browser testing. Passwords are intentional demo secrets. */
export const FRIENDS = [
  {
    username: "alice",
    password: "alice",
    actor: "ALICE" as Actor,
    displayName: "Alice",
    /** Personal friend invite — not a challenge code. */
    code: "A7K3M",
  },
  {
    username: "bob",
    password: "bob",
    actor: "BOB" as Actor,
    displayName: "Bob",
    code: "H41N2",
  },
  {
    username: "cara",
    password: "cara",
    actor: "CARA" as Actor,
    displayName: "Cara",
    code: "C9R4P",
  },
] as const;

export type Friend = (typeof FRIENDS)[number];

export type FriendSession = {
  username: string;
  displayName: string;
  actor: Actor;
  address: string;
  code: string;
};

export const SESSION_KEY = "focusbond:friend";

/** Seeded mutual friendships — all demo friends start linked. */
export const SEED_FRIENDSHIPS: [string, string][] = [
  ["alice", "bob"],
  ["bob", "cara"],
  ["alice", "cara"],
];

export function findFriend(username: string, password: string) {
  const u = username.trim().toLowerCase();
  return FRIENDS.find((f) => f.username === u && f.password === password) ?? null;
}

export function friendByUsername(username: string) {
  return FRIENDS.find((f) => f.username === username.toLowerCase()) ?? null;
}

export function friendByCode(raw: string) {
  const code = raw.trim().replace(/^#/, "").toUpperCase();
  if (!code) return null;
  return FRIENDS.find((f) => f.code === code) ?? null;
}

export function myFriendCode(username: string) {
  return friendByUsername(username)?.code ?? null;
}
