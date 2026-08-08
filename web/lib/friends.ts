import type { Actor } from "@/lib/chain";

/** Built-in friends for multi-browser testing. Passwords are intentional demo secrets. */
export const FRIENDS = [
  {
    username: "alice",
    password: "alice",
    actor: "ALICE" as Actor,
    displayName: "Alice",
  },
  {
    username: "bob",
    password: "bob",
    actor: "BOB" as Actor,
    displayName: "Bob",
  },
  {
    username: "cara",
    password: "cara",
    actor: "CARA" as Actor,
    displayName: "Cara",
  },
] as const;

export type Friend = (typeof FRIENDS)[number];

export type FriendSession = {
  username: string;
  displayName: string;
  actor: Actor;
  address: string;
};

export const SESSION_KEY = "focusbond:friend";

export function findFriend(username: string, password: string) {
  const u = username.trim().toLowerCase();
  return FRIENDS.find((f) => f.username === u && f.password === password) ?? null;
}
