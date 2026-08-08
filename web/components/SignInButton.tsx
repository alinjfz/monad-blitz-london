"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { monadTestnet } from "@/lib/chain";
import { FRIENDS, type FriendSession } from "@/lib/friends";

type Props = {
  session: FriendSession | null;
  onLogin: (session: FriendSession) => void;
  onLogout: () => void;
  className?: string;
  buttonLabel?: string;
};

export function SignInButton({
  session,
  onLogin,
  onLogout,
  className = "",
  buttonLabel = "Sign in",
}: Props) {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error: walletError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const logoutTitleId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const friendLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "login failed");
      if (isConnected) disconnect();
      onLogin(body as FriendSession);
      setOpen(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const googleSignIn = () => {
    setError(null);
    if (!process.env.NEXT_PUBLIC_PARA_API_KEY) {
      setError("Google sign-in isn’t configured yet.");
      return;
    }
    setError("Google sign-in is available once Para is wired.");
  };

  const confirmLogout = () => {
    if (session) onLogout();
    if (isConnected) disconnect();
    setLogoutOpen(false);
  };

  const accountLabel = session
    ? session.displayName
    : isConnected && address
      ? `${address.slice(0, 6)}…${address.slice(-4)}`
      : null;

  const logoutModal = logoutOpen && (
    <div className="modal-backdrop" onClick={() => setLogoutOpen(false)} role="presentation">
      <div
        className="modal logout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={logoutTitleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={logoutTitleId}>Log out?</h2>
        <p>You’ll need to sign in again to create or join challenges.</p>
        <div className="logout-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setLogoutOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={confirmLogout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );

  if (accountLabel) {
    const wrongChain = isConnected && !session && chainId !== monadTestnet.id;
    return (
      <div className={`connect-wrap ${className}`}>
        {wrongChain && (
          <button
            type="button"
            className="btn btn-warn"
            onClick={() => switchChain({ chainId: monadTestnet.id })}
          >
            Switch to Monad Testnet
          </button>
        )}
        <button type="button" className="btn btn-ghost connect-addr" onClick={() => setLogoutOpen(true)}>
          {accountLabel}
        </button>
        {logoutModal}
      </div>
    );
  }

  return (
    <div className={`connect-wrap ${className}`} ref={panelRef}>
      <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
        {buttonLabel}
      </button>
      {open && (
        <div className="connect-panel login-panel">
          <p className="connect-panel-title">Sign in</p>
          <p className="login-hint">
            Demo friends:{" "}
            {FRIENDS.map((f, i) => (
              <span key={f.username}>
                {i > 0 && " · "}
                <button
                  type="button"
                  className="login-hint-code"
                  onClick={() => {
                    setUsername(f.username);
                    setPassword(f.password);
                    setError(null);
                  }}
                >
                  {f.username}/{f.password}
                </button>
              </span>
            ))}
          </p>

          <label className="field-label">Username</label>
          <input
            className="field-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="alice"
            autoComplete="username"
          />
          <label className="field-label">Password</label>
          <input
            className="field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="alice"
            autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && friendLogin()}
          />
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%", marginBottom: "0.75rem" }}
            disabled={busy || !username || !password}
            onClick={() => friendLogin()}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <hr className="login-sep" />

          <p className="connect-panel-title">Or continue with</p>
          {connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="connect-option"
              disabled={isPending}
              onClick={() => {
                onLogout();
                connect({ connector: c, chainId: monadTestnet.id });
                setOpen(false);
              }}
            >
              {c.id === "injected" ? "Browser wallet" : c.name}
            </button>
          ))}
          <button type="button" className="connect-option google-option" onClick={googleSignIn}>
            Google
          </button>

          {(error || walletError) && (
            <p className="connect-error" style={{ position: "static", width: "auto", marginTop: "0.5rem" }}>
              {error || walletError?.message}
            </p>
          )}
        </div>
      )}
      {logoutModal}
    </div>
  );
}
