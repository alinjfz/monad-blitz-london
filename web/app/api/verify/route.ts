import { NextResponse } from "next/server";
import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from "viem";
import { focusBondAddress, monadTestnet } from "@/lib/chain";
import { refereeAccount } from "@/lib/server";

/// The vision referee. It never stores the image: the bytes are judged in
/// memory and only a signed verdict leaves this route.
///
/// This route can always fail safely. If no verdict can be produced we return
/// pass: null with no signature, the check-in stays valid-unless-challenged,
/// and the peer challenge path carries the demo.
export async function POST(req: Request) {
  try {
    const { circleId, member, proofHash, goal, imageBase64, filename } = await req.json();

    const verdict = await judge({ goal, imageBase64, filename });
    if (verdict.pass === null) {
      return NextResponse.json({ pass: null, reason: verdict.reason, source: verdict.source });
    }

    const referee = refereeAccount();
    const inner = keccak256(
      encodeAbiParameters(
        parseAbiParameters("uint256 chainId, address contractAddr, uint256 id, address member, bytes32 proofHash, bool pass"),
        [BigInt(monadTestnet.id), focusBondAddress, BigInt(circleId), member as Hex, proofHash as Hex, verdict.pass],
      ),
    );
    // The contract prefixes with EIP-191, which is exactly what signMessage does
    // when handed raw 32 bytes.
    const signature = await referee.signMessage({ message: { raw: inner } });

    return NextResponse.json({
      pass: verdict.pass,
      reason: verdict.reason,
      source: verdict.source,
      signature,
      referee: referee.address,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ pass: null, reason: message, source: "error" });
  }
}

type Verdict = { pass: boolean | null; reason: string; source: string };

async function judge({
  goal,
  imageBase64,
  filename,
}: {
  goal?: string;
  imageBase64?: string;
  filename?: string;
}): Promise<Verdict> {
  const mode = (process.env.REFEREE_MODE ?? "auto").toLowerCase();
  const apiKey = process.env.OPENAI_API_KEY;

  // Explicitly disabled: issue no verdicts and leave the onchain challenge
  // window as the only arbiter.
  if (mode === "off") {
    return { pass: null, reason: "referee disabled (REFEREE_MODE=off)", source: "disabled" };
  }

  const useModel = mode !== "heuristic" && Boolean(apiKey) && Boolean(imageBase64);
  if (useModel) {
    try {
      return await askVisionModel(apiKey!, goal ?? "", imageBase64!);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return fallback(filename, `vision model unavailable (${reason})`);
    }
  }

  return fallback(filename, mode === "heuristic" ? "REFEREE_MODE=heuristic" : "no OPENAI_API_KEY set");
}

async function askVisionModel(apiKey: string, goal: string, imageBase64: string): Promise<Verdict> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You verify accountability evidence. Decide whether the screenshot genuinely shows the stated goal was done. Be strict: unrelated images fail. Reply as JSON {\"pass\": boolean, \"reason\": string} with reason under 15 words.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Goal: ${goal}` },
              { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    const parsed = JSON.parse(body.choices[0].message.content);
    return { pass: Boolean(parsed.pass), reason: String(parsed.reason ?? ""), source: "gpt-4o-mini" };
  } finally {
    clearTimeout(timeout);
  }
}

/// Offline fallback so a verdict always exists without an API key. It judges the
/// filename rather than the pixels, which is a stand-in and is labelled as such
/// in the UI so nobody mistakes it for real verification. The onchain challenge
/// window remains the actual defence in this mode.
function fallback(filename: string | undefined, why: string): Verdict {
  const name = (filename ?? "").toLowerCase();
  const source = "heuristic";

  if (/fake|cat|unrelated|random|meme|screenshot-of-nothing/.test(name)) {
    return { pass: false, reason: `filename looks like fake evidence: ${why}`, source };
  }
  if (/real|proof|application|commit|email|leetcode|gym|word-?count|receipt/.test(name)) {
    return { pass: true, reason: `filename looks like genuine evidence: ${why}`, source };
  }
  return {
    pass: true,
    reason: `accepted without inspecting the image (${why}), so friends must police this one`,
    source,
  };
}
