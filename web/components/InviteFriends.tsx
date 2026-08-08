"use client";

import { useCallback, useEffect, useState } from "react";
import { myFriendCode } from "@/lib/friends";

type LinkedFriend = {
  username: string;
  displayName: string;
  code: string;
};

type Props = {
  username: string;
  busy?: boolean;
};

export function InviteFriends({ username, busy }: Props) {
  const [friendInput, setFriendInput] = useState("");
  const [linked, setLinked] = useState<LinkedFriend[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const friendCode = myFriendCode(username);

  const loadFriends = useCallback(async () => {
    const res = await fetch(`/api/friends?user=${encodeURIComponent(username)}`);
    const body = await res.json();
    if (res.ok) setLinked(body.friends ?? []);
  }, [username]);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  const copy = async () => {
    if (!friendCode) return;
    await navigator.clipboard.writeText(friendCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
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

  return (
    <div className="invite">
      <div className="invite-share">
        <div>
          <p className="field-label">Your friend code</p>
          <p className="invite-code">{friendCode}</p>
          <p className="dim" style={{ margin: "0.35rem 0 0.55rem", fontSize: "0.85rem" }}>
            You get this when you sign in. Share it so others can add you.
          </p>
          <div className="invite-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy code"}
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
        {error && <p className="invite-error">{error}</p>}
      </div>

      {linked.length > 0 ? (
        <ul className="friend-links">
          {linked.map((f) => (
            <li key={f.username}>
              <strong>{f.displayName}</strong>
              <span className="friend-link-code">{f.code}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dim">No friends yet. Share your code or add theirs.</p>
      )}
    </div>
  );
}

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
