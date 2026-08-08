"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { FAUCET_URL, monadTestnet } from "@/lib/chain";

export function ConnectButton({ className = "" }: { className?: string }) {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);

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
    <div className={`connect-wrap ${className}`}>
      <button type="button" className="btn btn-primary" disabled={isPending} onClick={() => setOpen((v) => !v)}>
        {isPending ? "Connecting…" : "Sign in"}
      </button>
      {open && (
        <div className="connect-panel">
          <p className="connect-panel-title">Connect</p>
          {connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="connect-option"
              onClick={() => {
                connect({ connector: c, chainId: monadTestnet.id });
                setOpen(false);
              }}
              disabled={isPending}
            >
              {c.id === "injected" ? "Browser wallet (MetaMask, Rabby, Rainbow…)" : c.name}
            </button>
          ))}
          <a className="connect-faucet" href={FAUCET_URL} target="_blank" rel="noreferrer">
            Need MON? Open testnet faucet →
          </a>
          <p className="connect-hint">
            Google login: install Para (`npm i -g @getpara/cli && para login`), then we wire social auth.
          </p>
        </div>
      )}
      {error && <p className="connect-error">{error.message}</p>}
    </div>
  );
}
