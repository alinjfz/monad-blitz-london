import { NextResponse } from "next/server";
import { findFriend } from "@/lib/friends";
import { actorAccount } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    const friend = findFriend(String(username ?? ""), String(password ?? ""));
    if (!friend) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }
    const account = actorAccount(friend.actor);
    return NextResponse.json({
      username: friend.username,
      displayName: friend.displayName,
      actor: friend.actor,
      address: account.address,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
