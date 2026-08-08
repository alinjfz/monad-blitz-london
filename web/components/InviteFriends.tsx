"use client";

import { useEffect, useMemo, useState } from "react";
import { myFriendCode } from "@/lib/friends";

type LinkedFriend = {
  username: string;
  displayName: string;
  code: string;
};

type Props = {
  username: string;
  circleId: bigint | null;
  challengeCode: string | null;
  onJoinChallenge: (id: bigint) => void;
  busy?: boolean;
};

/** Compact challenge invite: base36 circle id (e.g. 42 → "16"). */
export function toInviteCode(id: bigint): string {
  return id.toString(36).toUpperCase();
}

export function fromInviteCode(raw: string): bigint | null {
  const cleaned = raw.trim().replace(/^#/, "").replace(/^FB[-:]?/i, "");
  if (!cleaned) return null;
  if (/^\d+$/.test(cleaned)) return BigInt(cleaned);
  if (/^[0-9A-Z]+$/i.test(cleaned)) {
    try {
      return BigInt(parseInt(cleaned, 36));
    } catch {
      return null;
    }
  }
  return null;
}

export function InviteFriends({ username, circleId, challengeCode, onJoinChallenge, busy }: Props) {
  const [friendInput, setFriendInput] = useState("");
  const [challengeInput, setChallengeInput] = useState("");
  const [linked, setLinked] = useState<LinkedFriend[]>([]);
  const [copied, setCopied] = useState<"friend" | "challenge" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const friendCode = myFriendCode(username);

  const challengeUrl = useMemo(() => {
    if (typeof window === "undefined" || circleId === null) return "";
    return `${window.location.origin}/app?join=${circleId.toString()}`;
  }, [circleId]);

  const qrSrc = challengeUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(challengeUrl)}`
    : "";

  const loadFriends = async () => {
    const res = await fetch(`/api/friends?user=${encodeURIComponent(username)}`);
    const body = await res.json();
    if (res.ok) setLinked(body.friends ?? []);
  };

  useEffect(() => {
    void loadFriends();
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (kind: "friend" | "challenge" | "link") => {
    if (kind === "friend" && friendCode) await navigator.clipboard.writeText(friendCode);
    if (kind === "challenge" && challengeCode) await navigator.clipboard.writeText(challengeCode);
    if (kind === "link" && challengeUrl) await navigator.clipboard.writeText(challengeUrl);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1600);
  };

  const addFriend = async () => {
    setError(null);
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, code: friendInput }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Could not add friend");
      return;
    }
    setLinked(body.friends ?? []);
    setFriendInput("");
  };

  const submitChallenge = () => {
    setError(null);
    const id = fromInviteCode(challengeInput);
    if (id === null) {
      setError("That challenge code doesn’t look right");
      return;
    }
    onJoinChallenge(id);
  };

  return (
    <div className="invite">
      <div className="invite-share">
        <div>
          <p className="field-label">Your friend code</p>
          <p className="invite-code">{friendCode}</p>
          <p className="dim" style={{ margin: "0.35rem 0 0.55rem", fontSize: "0.85rem" }}>
            Share this so others can add you as a friend.
          </p>
          <div className="invite-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy("friend")}>
              {copied === "friend" ? "Copied" : "Copy code"}
            </button>
          </div>
        </div>
      </div>

      <div className="invite-join">
        <label className="field-label" htmlFor="friend-code-input">
          Add a friend
        </label>
        <div className="join-inline">
          <input
            id="friend-code-input"
            className="field-input"
            value={friendInput}
            onChange={(e) => {
              setFriendInput(e.target.value.toUpperCase());
              setError(null);
            }}
            placeholder="e.g. H41N2"
            spellCheck={false}
            autoCapitalize="characters"
            onKeyDown={(e) => e.key === "Enter" && void addFriend()}
          />
          <button type="button" className="btn btn-primary" disabled={!friendInput || !!busy} onClick={() => void addFriend()}>
            Add
          </button>
        </div>
      </div>

      {linked.length > 0 && (
        <ul className="friend-links">
          {linked.map((f) => (
            <li key={f.username}>
              <strong>{f.displayName}</strong>
              <span className="friend-link-code">{f.code}</span>
            </li>
          ))}
        </ul>
      )}

      <hr className="invite-sep" />

      {circleId !== null && challengeCode ? (
        <div className="invite-share">
          <div>
            <p className="field-label">Challenge code</p>
            <p className="invite-code">{challengeCode}</p>
            <p className="dim" style={{ margin: "0.35rem 0 0.55rem", fontSize: "0.85rem" }}>
              Different from your friend code — use this so friends can join this stake.
            </p>
            <div className="invite-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy("challenge")}>
                {copied === "challenge" ? "Copied" : "Copy code"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy("link")}>
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
        <p className="dim">Create a challenge to get a challenge code.</p>
      )}

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
            onKeyDown={(e) => e.key === "Enter" && submitChallenge()}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!challengeInput || !!busy}
            onClick={submitChallenge}
          >
            Join
          </button>
        </div>
      </div>

      {error && <p className="invite-error">{error}</p>}
    </div>
  );
}
