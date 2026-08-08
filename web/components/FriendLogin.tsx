"use client";

import { useState } from "react";
import { FRIENDS, type FriendSession } from "@/lib/friends";

type Props = {
  session: FriendSession | null;
  onLogin: (session: FriendSession) => void;
  onLogout: () => void;
};

export function FriendLogin({ session, onLogin, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("alice");
  const [password, setPassword] = useState("alice");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (u = username, p = password) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "login failed");
      onLogin(body as FriendSession);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (session) {
    return (
      <div className="connect-wrap">
        <button type="button" className="btn btn-ghost connect-addr" onClick={onLogout} title="Log out">
          {session.displayName}
        </button>
      </div>
    );
  }

  return (
    <div className="connect-wrap">
      <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
        Sign in
      </button>
      {open && (
        <div className="connect-panel login-panel">
          <p className="connect-panel-title">Friend login</p>
          <p className="connect-hint" style={{ marginBottom: "0.6rem" }}>
            Use a different friend in each browser to test together.
          </p>
          <div className="friend-quick">
            {FRIENDS.map((f) => (
              <button
                key={f.username}
                type="button"
                className="connect-option"
                disabled={busy}
                onClick={() => {
                  setUsername(f.username);
                  setPassword(f.password);
                  void submit(f.username, f.password);
                }}
              >
                Continue as {f.displayName}
              </button>
            ))}
          </div>
          <hr className="login-sep" />
          <label className="field-label">Username</label>
          <input className="field-input" value={username} onChange={(e) => setUsername(e.target.value)} />
          <label className="field-label">Password</label>
          <input
            className="field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={busy} onClick={() => submit()}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {error && <p className="connect-error" style={{ position: "static", width: "auto" }}>{error}</p>}
          <p className="connect-hint">alice/alice · bob/bob · cara/cara</p>
        </div>
      )}
    </div>
  );
}
