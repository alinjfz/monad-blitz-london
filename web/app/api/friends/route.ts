import { NextResponse } from "next/server";
import { friendByCode, friendByUsername, FRIENDS } from "@/lib/friends";

/** In-memory mutual friend links for the demo (resets on server restart). */
const links = new Map<string, Set<string>>();

function listFor(username: string) {
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
  return NextResponse.json({ friends: listFor(user) });
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

    if (!links.has(me)) links.set(me, new Set());
    if (!links.has(other.username)) links.set(other.username, new Set());
    links.get(me)!.add(other.username);
    links.get(other.username)!.add(me);

    return NextResponse.json({
      friends: listFor(me),
      added: { username: other.username, displayName: other.displayName, code: other.code },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const user = new URL(req.url).searchParams.get("user")?.trim().toLowerCase();
  const other = new URL(req.url).searchParams.get("other")?.trim().toLowerCase();
  if (!user || !other) {
    return NextResponse.json({ error: "user and other required" }, { status: 400 });
  }
  links.get(user)?.delete(other);
  links.get(other)?.delete(user);
  return NextResponse.json({ friends: listFor(user) });
}

// silence unused in edge cases
void FRIENDS;
