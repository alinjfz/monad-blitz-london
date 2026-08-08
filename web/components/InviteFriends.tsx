"use client";

import { useMemo, useState } from "react";

type Props = {
  circleId: bigint | null;
  onJoin: (id: bigint) => void;
  busy?: boolean;
};

/** Compact invite token: base36 circle id (e.g. 42 → "16"). */
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

export function InviteFriends({ circleId, onJoin, busy }: Props) {
  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const code = circleId !== null ? toInviteCode(circleId) : null;
  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined" || circleId === null) return "";
    return `${window.location.origin}/app?join=${circleId.toString()}`;
  }, [circleId]);

  const qrSrc = inviteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(inviteUrl)}`
    : "";

  const copy = async (kind: "code" | "link") => {
    if (kind === "code" && code) await navigator.clipboard.writeText(code);
    if (kind === "link" && inviteUrl) await navigator.clipboard.writeText(inviteUrl);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1600);
  };

  const submitCode = () => {
    setJoinError(null);
    const id = fromInviteCode(codeInput);
    if (id === null) {
      setJoinError("That code doesn’t look right");
      return;
    }
    onJoin(id);
  };

  return (
    <div className="invite">
      {circleId !== null && code ? (
        <div className="invite-share">
          <div>
            <p className="field-label">Invite code</p>
            <p className="invite-code">{code}</p>
            <div className="invite-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy("code")}>
                {copied === "code" ? "Copied" : "Copy code"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy("link")}>
                {copied === "link" ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
          {qrSrc && (
            <div className="invite-qr-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="invite-qr" src={qrSrc} alt={`QR for invite ${code}`} width={96} height={96} />
            </div>
          )}
        </div>
      ) : (
        <p className="dim">Create a challenge to get an invite code.</p>
      )}

      <div className="invite-join">
        <label className="field-label" htmlFor="invite-code-input">
          Have a code?
        </label>
        <div className="join-inline">
          <input
            id="invite-code-input"
            className="field-input"
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value.toUpperCase());
              setJoinError(null);
            }}
            placeholder="Enter code"
            spellCheck={false}
            autoCapitalize="characters"
            onKeyDown={(e) => e.key === "Enter" && submitCode()}
          />
          <button type="button" className="btn btn-primary" disabled={!codeInput || !!busy} onClick={submitCode}>
            Join
          </button>
        </div>
        {joinError && <p className="invite-error">{joinError}</p>}
      </div>
    </div>
  );
}
