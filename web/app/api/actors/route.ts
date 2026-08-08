import { NextResponse } from "next/server";
import { ACTORS } from "@/lib/chain";
import { actorAccount } from "@/lib/server";

/// Addresses are public; keys stay on the server. This keeps .env the single
/// source of truth instead of duplicating addresses into NEXT_PUBLIC_ vars.
export async function GET() {
  const out: Record<string, string> = {};
  for (const actor of ACTORS) {
    try {
      out[actor] = actorAccount(actor).address;
    } catch {
      out[actor] = "";
    }
  }
  return NextResponse.json(out);
}
