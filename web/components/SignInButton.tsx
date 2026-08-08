"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { monadTestnet } from "@/lib/chain";
import { FRIENDS, type FriendSession } from "@/lib/friends";

type Props = {
  session: FriendSession | null;
  onLogin: (session: FriendSession) => void;
  onLogout: () => void;
  className?: string;
};

export function SignInButton({ session, onLogin, onLogout, className = "" }: Props) {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error: walletError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Logged in as friend account
  if (session) {
    return (
      <div className={`connect-wrap ${className}`}>
        <button type="button" className="btn btn-ghost connect-addr" onClick={onLogout} title="Log out">
          {session.displayName}
        </button>
      </div>
    );
  }

  // Logged in with browser wallet
  if (isConnected && address) {
    const wrongChain = chainId !== monadTestnet.id;
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
        <button type="button" className="btn btn-ghost connect-addr" onClick={() => disconnect()}>
          {address.slice(0, 6)}…{address.slice(-4)}
        </button>
      </div>
    );
  }

  return (
    <div className={`connect-wrap ${className}`} ref={panelRef}>
      <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
        Sign in
      </button>
      {open && (
        <div className="connect-panel login-panel">
          <p className="connect-panel-title">Sign in</p>

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
            placeholder="••••"
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

          <p className="connect-hint" style={{ marginBottom: "0.45rem" }}>
            Friends: {FRIENDS.map((f) => f.username).join(" · ")} (password = username)
          </p>

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
    </div>
  );
}
