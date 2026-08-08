"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { fromInviteCode } from "@/components/InviteFriends";

type OpenChallenge = {
  code: string;
  label: string;
  goal: string;
  stakeMon: string;
  host: string;
  hostName: string;
  hostFriendCode: string | null;
  circleId: string | null;
  members: number;
  open: boolean;
};

type Props = {
  circleId: bigint | null;
  challengeCode: string | null;
  onJoinChallenge: (id: bigint) => void;
  onCreate: () => void;
  busy?: boolean;
  members: ReactNode;
};

export function ChallengePanel({
  circleId,
  challengeCode,
  onJoinChallenge,
  onCreate,
  busy,
  members,
}: Props) {
  const [challengeInput, setChallengeInput] = useState("");
  const [openChallenges, setOpenChallenges] = useState<OpenChallenge[]>([]);
  const [copied, setCopied] = useState<"challenge" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const challengeUrl = useMemo(() => {
    if (typeof window === "undefined" || circleId === null) return "";
    return `${window.location.origin}/app?join=${circleId.toString()}`;
  }, [circleId]);

  const qrSrc = challengeUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(challengeUrl)}`
    : "";

  const loadChallenges = useCallback(async () => {
    const res = await fetch("/api/challenges");
    const body = await res.json();
    if (res.ok) setOpenChallenges(body.challenges ?? []);
  }, []);

  useEffect(() => {
    void loadChallenges();
  }, [loadChallenges]);

  const copy = async (kind: "challenge" | "link") => {
    if (kind === "challenge" && challengeCode) await navigator.clipboard.writeText(challengeCode);
    if (kind === "link" && challengeUrl) await navigator.clipboard.writeText(challengeUrl);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1600);
  };

  const resolveAndJoin = async (raw: string) => {
    setError(null);
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed) return;

    setOpening(trimmed);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resolve", code: trimmed }),
      });
      const body = await res.json();
      if (res.ok && body.circleId) {
        onJoinChallenge(BigInt(body.circleId));
        await loadChallenges();
        return;
      }
      if (!res.ok) {
        const id = fromInviteCode(trimmed);
        if (id !== null) {
          onJoinChallenge(id);
          return;
        }
        setError(body.error ?? "That challenge code doesn’t look right");
        return;
      }
      setError(body.error ?? "Challenge isn’t open yet");
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="invite">
      {circleId !== null && challengeCode ? (
        <div className="invite-share">
          <div>
            <p className="field-label">Challenge code</p>
            <p className="invite-code">{challengeCode}</p>
            <p className="dim" style={{ margin: "0.35rem 0 0.55rem", fontSize: "0.85rem" }}>
              Share this so friends can stake into this round.
            </p>
            <div className="invite-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy("challenge")}>
                {copied === "challenge" ? "Copied" : "Copy code"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy("link")}>
                {copied === "link" ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
          {qrSrc && (
            <div className="invite-qr-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="invite-qr" src={qrSrc} alt={`QR for challenge ${challengeCode}`} width={96} height={96} />
            </div>
          )}
        </div>
      ) : (
        <div className="invite-empty-challenge">
          <p className="dim">Create a challenge to get a challenge code.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>
            Create challenge
          </button>
        </div>
      )}

      <div>
        <p className="field-label">Open challenges</p>
        <div className="seed-list">
          {openChallenges.map((c) => (
            <div key={c.code} className="seed-row">
              <div>
                <strong>{c.label}</strong>
                <p className="dim seed-meta">
                  {c.hostName} · {c.stakeMon} MON · code <span className="friend-link-code">{c.code}</span>
                  {c.open ? ` · ${c.members} in` : " · lobby"}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!!busy || opening === c.code}
                onClick={() => void resolveAndJoin(c.code)}
              >
                {opening === c.code ? "Opening…" : c.open ? "Join" : "Open"}
              </button>
            </div>
          ))}
          {openChallenges.length === 0 && <p className="dim">No seeded challenges yet.</p>}
        </div>
      </div>

      <div className="invite-join">
        <label className="field-label" htmlFor="challenge-code-input">
          Join a challenge
        </label>
        <div className="join-inline">
          <input
            id="challenge-code-input"
            className="field-input"
            value={challengeInput}
            onChange={(e) => {
              setChallengeInput(e.target.value.toUpperCase());
              setError(null);
            }}
            placeholder="Challenge code"
            spellCheck={false}
            autoCapitalize="characters"
            onKeyDown={(e) => e.key === "Enter" && void resolveAndJoin(challengeInput)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!challengeInput || !!busy || !!opening}
            onClick={() => void resolveAndJoin(challengeInput)}
          >
            Join
          </button>
        </div>
        {error && <p className="invite-error">{error}</p>}
      </div>

      <div className="challenge-members">{members}</div>
    </div>
  );
}
