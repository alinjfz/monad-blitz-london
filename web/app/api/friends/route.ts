import { NextResponse } from "next/server";
import { friendByCode, friendByUsername, FRIENDS, SEED_FRIENDSHIPS } from "@/lib/friends";
import { readJson, writeJson } from "@/lib/persist";

type Store = Record<string, string[]>;

function defaultStore(): Store {
  const store: Store = {};
  for (const f of FRIENDS) store[f.username] = [];
  for (const [a, b] of SEED_FRIENDSHIPS) {
    if (!store[a].includes(b)) store[a].push(b);
    if (!store[b].includes(a)) store[b].push(a);
  }
  return store;
}

function loadStore(): Store {
  const stored = readJson<Store | null>("friends.json", null);
  if (!stored) {
    const seed = defaultStore();
    writeJson("friends.json", seed);
    return seed;
  }
  // Ensure seed links always exist.
  let dirty = false;
  for (const f of FRIENDS) {
    if (!stored[f.username]) {
      stored[f.username] = [];
      dirty = true;
    }
  }
  for (const [a, b] of SEED_FRIENDSHIPS) {
    if (!stored[a].includes(b)) {
      stored[a].push(b);
      dirty = true;
    }
    if (!stored[b].includes(a)) {
      stored[b].push(a);
      dirty = true;
    }
  }
  if (dirty) writeJson("friends.json", stored);
  return stored;
}

function listFor(store: Store, username: string) {
  const set = store[username.toLowerCase()] ?? [];
  return set
    .map((u) => friendByUsername(u))
    .filter(Boolean)
    .map((f) => ({
      username: f!.username,
      displayName: f!.displayName,
      code: f!.code,
      actor: f!.actor,
    }));
}

export async function GET(req: Request) {
  const user = new URL(req.url).searchParams.get("user")?.trim().toLowerCase();
  if (!user || !friendByUsername(user)) {
    return NextResponse.json({ error: "unknown user" }, { status: 400 });
  }
  const me = friendByUsername(user)!;
  const store = loadStore();
  return NextResponse.json({
    friends: listFor(store, user),
    me: { username: me.username, displayName: me.displayName, code: me.code },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const me = String(body.username ?? "").trim().toLowerCase();
    const code = String(body.code ?? "");
    if (!friendByUsername(me)) {
      return NextResponse.json({ error: "sign in first" }, { status: 401 });
    }
    const other = friendByCode(code);
    if (!other) {
      return NextResponse.json({ error: "That friend code doesn’t look right" }, { status: 400 });
    }
    if (other.username === me) {
      return NextResponse.json({ error: "That’s your own code" }, { status: 400 });
    }

    const store = loadStore();
    if (!store[me]) store[me] = [];
    if (!store[other.username]) store[other.username] = [];
    if (!store[me].includes(other.username)) store[me].push(other.username);
    if (!store[other.username].includes(me)) store[other.username].push(me);
    writeJson("friends.json", store);

    return NextResponse.json({
      friends: listFor(store, me),
      added: {
        username: other.username,
        displayName: other.displayName,
        code: other.code,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
