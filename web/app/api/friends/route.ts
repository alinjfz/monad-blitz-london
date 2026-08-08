import { NextResponse } from "next/server";
import { friendByCode, friendByUsername, SEED_FRIENDSHIPS } from "@/lib/friends";

/** In-memory mutual friend links for the demo (resets on server restart). */
const links = new Map<string, Set<string>>();
let seeded = false;

function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  for (const [a, b] of SEED_FRIENDSHIPS) {
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a)!.add(b);
    links.get(b)!.add(a);
  }
}

function listFor(username: string) {
  ensureSeeded();
  const set = links.get(username.toLowerCase()) ?? new Set<string>();
  return [...set]
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
  return NextResponse.json({
    friends: listFor(user),
    me: { username: me.username, displayName: me.displayName, code: me.code },
  });
}

export async function POST(req: Request) {
  try {
    ensureSeeded();
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

    if (!links.has(me)) links.set(me, new Set());
    if (!links.has(other.username)) links.set(other.username, new Set());
    links.get(me)!.add(other.username);
    links.get(other.username)!.add(me);

    return NextResponse.json({
      friends: listFor(me),
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
