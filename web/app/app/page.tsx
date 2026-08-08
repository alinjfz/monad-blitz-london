"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  decodeEventLog,
  encodeFunctionData,
  keccak256,
  parseEther,
  type Abi,
  type Hex,
} from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { CreateChallengeModal } from "@/components/CreateChallengeModal";
import { focusBondAbi } from "@/lib/abi";
import {
  explorerAddress,
  explorerTx,
  FAUCET_URL,
  focusBondAddress,
  GAS_LIMIT,
  monadTestnet,
  publicClient,
} from "@/lib/chain";
import { fmtClock, mon, phaseLabel, short, ZERO, ZERO_HASH } from "@/lib/format";
import type { Circle, FeedItem, MemberView, Phase, Verdict } from "@/lib/types";
import type { Preset } from "@/lib/presets";

const STORAGE_KEY = "focusbond:circleId";
const client = publicClient;

function loadStoredCircleId(): bigint | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw || !/^\d+$/.test(raw)) return null;
  return BigInt(raw);
}

function storeCircleId(id: bigint | null) {
  if (typeof window === "undefined") return;
  if (id === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, id.toString());
}

export default function AppPage() {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [circleId, setCircleId] = useState<bigint | null>(null);
  const [joinId, setJoinId] = useState("");
  const [circle, setCircle] = useState<Circle | null>(null);
  const [board, setBoard] = useState<MemberView[]>([]);
  const [walletBal, setWalletBal] = useState<bigint>(0n);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const fromBlock = useRef<bigint | null>(null);
  const refreshing = useRef(false);
  const circleIdRef = useRef<bigint | null>(null);
  circleIdRef.current = circleId;

  const refresh = useCallback(async (idOverride?: bigint | null) => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const id = idOverride !== undefined ? idOverride : circleIdRef.current;

      if (address) {
        setWalletBal(await client.getBalance({ address }));
      }

      if (id === null) {
        setCircle(null);
        setBoard([]);
        return;
      }

      const raw = await client.readContract({
        address: focusBondAddress,
        abi: focusBondAbi,
        functionName: "getCircle",
        args: [id],
      });
      const brd = await client.readContract({
        address: focusBondAddress,
        abi: focusBondAbi,
        functionName: "getBoard",
        args: [id],
      });
      const c = raw as readonly unknown[];
      const next: Circle = {
        stake: c[0] as bigint,
        goal: c[1] as string,
        roundSeconds: c[2] as bigint,
        challengeSeconds: c[3] as bigint,
        endsAt: c[4] as bigint,
        challengeEndsAt: c[5] as bigint,
        settled: c[6] as boolean,
        members: c[7] as readonly Hex[],
        escrow: c[8] as bigint,
      };

      // Empty / aborted circle
      if (next.stake === 0n && next.members.length === 0) {
        setCircle(null);
        setBoard([]);
        setCircleId(null);
        storeCircleId(null);
        return;
      }

      setCircle(next);
      setBoard(brd as unknown as MemberView[]);

      const bn = await client.getBlockNumber();
      if (fromBlock.current === null) fromBlock.current = bn > 120n ? bn - 120n : 0n;
      const logs = await client.getLogs({
        address: focusBondAddress,
        fromBlock: fromBlock.current,
        toBlock: bn,
      });
      fromBlock.current = bn + 1n;

      const items: FeedItem[] = [];
      for (const log of logs) {
        try {
          const ev = decodeEventLog({ abi: focusBondAbi, data: log.data, topics: log.topics });
          items.push({
            key: `${log.transactionHash}-${log.logIndex}`,
            name: ev.eventName,
            text: describe(ev.eventName, ev.args as Record<string, unknown>),
            hash: log.transactionHash!,
          });
        } catch {
          /* skip */
        }
      }
      if (items.length) {
        setFeed((prev) => {
          const seen = new Set(prev.map((p) => p.key));
          const merged = [...items.reverse().filter((i) => !seen.has(i.key)), ...prev];
          return merged.slice(0, 40);
        });
      }

      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/15\/sec|rate|limited|429/i.test(message)) setError(message);
    } finally {
      refreshing.current = false;
    }
  }, [address]);

  // Local clock only — no RPC.
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Load invite / stored circle once, then refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const join = params.get("join");
    const stored = loadStoredCircleId();
    const initial = join && /^\d+$/.test(join) ? BigInt(join) : stored;
    if (join && /^\d+$/.test(join)) {
      setJoinId(join);
      storeCircleId(BigInt(join));
    }
    if (initial !== null) {
      setCircleId(initial);
      void refresh(initial);
    } else if (address) {
      void client.getBalance({ address }).then(setWalletBal).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh when tab becomes visible again (friend joined in another browser).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  // Refresh balance when wallet connects.
  useEffect(() => {
    if (address) void refresh();
  }, [address, refresh]);

  const sendTx = useCallback(
    async (fn: keyof typeof GAS_LIMIT, args: unknown[] = [], value?: bigint) => {
      if (!address) {
        setError("Connect a wallet first");
        return null;
      }
      if (!walletClient) {
        setError("Wallet still connecting — try again in a second");
        return null;
      }
      if (chainId !== monadTestnet.id) {
        setError("Switch to Monad Testnet, then try again");
        return null;
      }

      setBusy(fn);
      setError(null);
      try {
        const data = encodeFunctionData({
          abi: focusBondAbi as Abi,
          functionName: fn,
          args: args as never[],
        });
        const hash = await walletClient.sendTransaction({
          to: focusBondAddress,
          data,
          value,
          gas: GAS_LIMIT[fn],
          chain: monadTestnet,
          account: address,
        });
        await client.waitForTransactionReceipt({ hash });
        setNotice(`${fn} confirmed`);
        await refresh();
        return hash as Hex;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [address, chainId, refresh, walletClient],
  );

  const createCircle = async ({
    preset,
    stakeMon,
    customGoal,
  }: {
    preset: Preset;
    stakeMon: string;
    customGoal: string;
  }) => {
    if (!isConnected || !address) {
      setError("Connect a wallet first to create a challenge");
      return;
    }
    if (!walletClient) {
      setError("Wallet still connecting — wait a moment and try again");
      return;
    }

    const stake = parseEther(stakeMon || "0.1");
    if (walletBal > 0n && stake > walletBal) {
      setError(`Not enough MON. Stake is ${stakeMon} MON; you have ${mon(walletBal, 3)} MON. Fund via the faucet.`);
      return;
    }

    const goal = `${preset.label}: ${customGoal.trim() || preset.goal}`;
    const before = (await client.readContract({
      address: focusBondAddress,
      abi: focusBondAbi,
      functionName: "circleCount",
    })) as bigint;

    const hash = await sendTx(
      "createCircle",
      [stake, goal, BigInt(preset.round), BigInt(preset.challenge)],
      stake,
    );
    if (!hash) return;

    const after = (await client.readContract({
      address: focusBondAddress,
      abi: focusBondAbi,
      functionName: "circleCount",
    })) as bigint;
    const newId = after > before ? after : after;
    setCircleId(newId);
    storeCircleId(newId);
    fromBlock.current = null;
    await refresh(newId);
    setCreateOpen(false);
    setNotice(`Challenge #${newId.toString()} created — copy the invite link for friends`);
  };

  const adoptCircle = async (id: bigint) => {
    setCircleId(id);
    storeCircleId(id);
    fromBlock.current = null;
    await refresh(id);
  };

  const joinCircle = async (id: bigint) => {
    if (!isConnected) {
      setError("Connect a wallet first to join");
      return;
    }
    await adoptCircle(id);
    const raw = await client.readContract({
      address: focusBondAddress,
      abi: focusBondAbi,
      functionName: "getCircle",
      args: [id],
    });
    const stake = (raw as readonly unknown[])[0] as bigint;
    if (stake === 0n) {
      setError(`Circle #${id.toString()} not found`);
      return;
    }
    await sendTx("join", [id], stake);
  };

  const checkIn = async (file: File) => {
    if (circleId === null || !circle || !address) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const proofHash = keccak256(bytes);
    const hash = await sendTx("submitProof", [circleId, proofHash]);
    if (!hash) return;

    setBusy("referee reviewing");
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          circleId: circleId.toString(),
          member: address,
          proofHash,
          goal: circle.goal,
          filename: file.name,
          imageBase64: toBase64(bytes),
        }),
      });
      const verdict = await res.json();
      setVerdicts((v) => ({ ...v, [address]: verdict }));
      if (verdict.signature) {
        await sendTx("attest", [circleId, address, verdict.pass, verdict.signature]);
      }
    } catch (err) {
      setVerdicts((v) => ({
        ...v,
        [address]: {
          pass: null,
          reason: err instanceof Error ? err.message : String(err),
          source: "error",
        },
      }));
    } finally {
      setBusy(null);
    }
  };

  const phase: Phase = useMemo(() => {
    if (!circle || circle.stake === 0n) return "none";
    if (circle.settled) return "settled";
    if (circle.endsAt === 0n) return "lobby";
    if (BigInt(now) <= circle.endsAt) return "focus";
    if (BigInt(now) <= circle.challengeEndsAt) return "challenge";
    return "ready";
  }, [circle, now]);

  const secondsLeft = useMemo(() => {
    if (!circle) return 0;
    const target = phase === "focus" ? circle.endsAt : phase === "challenge" ? circle.challengeEndsAt : 0n;
    return target === 0n ? 0 : Math.max(0, Number(target) - now);
  }, [circle, phase, now]);

  const nameOf = (addr?: string) => {
    if (!addr) return "";
    if (address && addr.toLowerCase() === address.toLowerCase()) return "You";
    return short(addr);
  };

  const pending = board.filter((m) => m.proofHash === ZERO_HASH && !m.broke);
  const potAtStake = circle ? circle.stake * BigInt(board.filter((m) => !m.completer).length) : 0n;
  const iAmMember = !!address && board.some((m) => m.addr.toLowerCase() === address.toLowerCase());
  const myMember = address
    ? board.find((m) => m.addr.toLowerCase() === address.toLowerCase())
    : undefined;

  const copyInvite = async () => {
    if (circleId === null) return;
    const url = `${window.location.origin}/app?join=${circleId.toString()}`;
    await navigator.clipboard.writeText(url);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  return (
    <div className="app-shell">
      <header className="app-top">
        <div className="app-top-left">
          <Link href="/" className="brand">
            Focus<span>Bond</span>
          </Link>
          <a className="fund-link" href={FAUCET_URL} target="_blank" rel="noreferrer">
            Fund testnet wallet
          </a>
        </div>
        <div className="app-top-right">
          {isConnected && (
            <div className="bal-chip">
              {mon(walletBal, 3)} <small>MON</small>
            </div>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => refresh()} disabled={!!busy}>
            Refresh
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            + New challenge
          </button>
          <ConnectButton />
        </div>
      </header>

      {error && <div className="alert err">{error}</div>}
      {notice && !error && <div className="alert ok">{notice}</div>}

      <section className="ongoing">
        {phase === "none" ? (
          <div className="ongoing-empty">
            <h1>No challenge yet</h1>
            <p>
              Create one, then share the invite link. Friends open it in another browser, connect their
              wallet, and accept.
            </p>
            <div className="ongoing-empty-actions">
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                Create challenge
              </button>
              <div className="join-inline">
                <input
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value.replace(/\D/g, ""))}
                  placeholder="Circle #"
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!joinId || !!busy}
                  onClick={() => joinCircle(BigInt(joinId))}
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="ongoing-main">
              <div>
                <p className="ongoing-kicker">{phaseLabel(phase)}</p>
                <h1 className="ongoing-goal">{circle?.goal}</h1>
                <p className="ongoing-meta">
                  Circle #{circleId?.toString()} · {board.length} friends · {mon(circle?.stake ?? 0n)} MON
                  each · escrow {mon(circle?.escrow ?? 0n)} MON
                </p>
              </div>
              <div className={`ongoing-timer ${phase === "focus" && secondsLeft <= 15 ? "urgent" : ""}`}>
                {phase === "focus" || phase === "challenge" ? fmtClock(secondsLeft) : "--:--"}
              </div>
            </div>

            {phase === "focus" && pending.length > 0 && (
              <div className="alert risk">
                {pending.length === 1 ? (
                  <>
                    <b>{nameOf(pending[0].addr)} is last.</b> {mon(circle!.stake)} MON goes to everyone else
                    in {fmtClock(secondsLeft)} unless they check in.
                  </>
                ) : (
                  <>
                    <b>{pending.length} friends have not checked in.</b> {mon(potAtStake)} MON on the line
                    with {fmtClock(secondsLeft)} left.
                  </>
                )}
              </div>
            )}

            <div className="ongoing-actions">
              {phase === "lobby" && iAmMember && board.length >= 2 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!!busy}
                  onClick={() => sendTx("start", [circleId!])}
                >
                  Start round
                </button>
              )}
              {phase === "lobby" && iAmMember && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={!!busy}
                  onClick={() => sendTx("abort", [circleId!])}
                >
                  Abort &amp; refund
                </button>
              )}
              {phase === "lobby" && !iAmMember && isConnected && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!!busy}
                  onClick={() => joinCircle(circleId!)}
                >
                  Accept &amp; stake {mon(circle?.stake ?? 0n)} MON
                </button>
              )}
              {phase === "lobby" && !isConnected && (
                <p className="panel-hint" style={{ margin: 0 }}>
                  Connect a wallet to accept this challenge.
                </p>
              )}
              {phase === "focus" && iAmMember && (
                <label className="file-btn">
                  Check in — upload proof
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!!busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) checkIn(f);
                    }}
                  />
                </label>
              )}
              {phase === "focus" && iAmMember && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={!!busy}
                  onClick={() => sendTx("breakFocus", [circleId!])}
                >
                  Break focus
                </button>
              )}
              {phase === "ready" && (
                <button
                  type="button"
                  className="btn btn-settle"
                  disabled={!!busy}
                  onClick={() => sendTx("settle", [circleId!])}
                >
                  Settle — pay the friends who showed up
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={copyInvite} disabled={circleId === null}>
                {inviteCopied ? "Copied!" : "Copy invite link"}
              </button>
              {busy && <span className="busy-label">{busy}…</span>}
            </div>

            {myMember && (
              <div className="my-status">
                {statusBadge(myMember, phase)}
                {verdicts[address ?? ""] && (
                  <span className="verdict-inline">
                    Referee:{" "}
                    {verdicts[address!].pass === true
                      ? "PASS"
                      : verdicts[address!].pass === false
                        ? "FAIL"
                        : "—"}{" "}
                    ({verdicts[address!].source})
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <div className="app-grid">
        <section className="panel friends-panel">
          <header className="panel-head">
            <h2>Friends</h2>
            <span>Real wallets · share the invite</span>
          </header>

          {!isConnected && (
            <p className="panel-hint">Connect your wallet. Friends join from another browser with the invite link.</p>
          )}

          <div className="friends-list">
            {board.length === 0 && (
              <p className="dim">No one in the circle yet. Create a challenge and share the invite.</p>
            )}
            {board.map((m) => (
              <div
                key={m.addr}
                className={`friend-row ${m.completer ? "ok" : phase !== "lobby" && phase !== "none" ? "risk" : ""}`}
              >
                <div>
                  <strong>{nameOf(m.addr)}</strong>
                  <a href={explorerAddress(m.addr)} target="_blank" rel="noreferrer" className="addr">
                    {short(m.addr)}
                  </a>
                  <div className="flame">streak {m.stats.streak}</div>
                </div>
                <div className="friend-side">
                  {statusBadge(m, phase)}
                  {phase === "focus" && address && m.addr.toLowerCase() !== address.toLowerCase() && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!!busy}
                      onClick={() => sendTx("nudge", [circleId!, m.addr])}
                    >
                      Nudge
                    </button>
                  )}
                  {phase === "challenge" && address && m.addr.toLowerCase() !== address.toLowerCase() && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!!busy}
                      onClick={() => sendTx("challenge", [circleId!, m.addr], circle?.stake)}
                    >
                      Dispute
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Onchain activity</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => refresh()} disabled={!!busy}>
              Refresh
            </button>
          </header>
          <div className="feed">
            {feed.map((f) => (
              <div className="feed-row" key={f.key}>
                <span className="ev">{f.name}</span>
                <span style={{ flex: 1 }}>{f.text}</span>
                <a href={explorerTx(f.hash)} target="_blank" rel="noreferrer">
                  tx
                </a>
              </div>
            ))}
            {feed.length === 0 && <div className="dim">No events yet — refresh after a transaction</div>}
          </div>
        </section>
      </div>

      <CreateChallengeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createCircle}
        busy={!!busy}
      />
    </div>
  );
}

function statusBadge(m: MemberView | undefined, phase: string) {
  if (!m) return <span className="badge waiting">not in circle</span>;
  if (m.broke) return <span className="badge failed">broke focus</span>;
  if (m.failedByAI) return <span className="badge failed">referee rejected</span>;
  if (m.proofHash === ZERO_HASH) {
    return <span className="badge waiting">{phase === "focus" ? "not checked in" : "missed"}</span>;
  }
  if (m.challenger !== ZERO && !m.verified) return <span className="badge challenged">disputed</span>;
  if (m.verified) return <span className="badge verified">verified</span>;
  return <span className="badge unverified">committed</span>;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function describe(name: string, args: Record<string, unknown>) {
  const a = (k: string) => String(args[k] ?? "");
  const s = (k: string) => short(a(k));
  switch (name) {
    case "CircleCreated":
      return `${s("creator")} opened "${a("goal")}" at ${mon(args.stake as bigint)} MON each`;
    case "Joined":
      return `${s("member")} staked ${mon(args.stake as bigint)} MON`;
    case "Started":
      return "round started";
    case "ProofSubmitted":
      return `${s("member")} committed a proof hash`;
    case "Attested":
      return `referee ${args.pass ? "passed" : "failed"} ${s("member")}`;
    case "Challenged":
      return `${s("challenger")} disputed ${s("member")}`;
    case "FocusBroken":
      return `${s("member")} broke focus`;
    case "Nudged":
      return `${s("from")} nudged ${s("to")}`;
    case "Settled": {
      const winners = (args.completers as Hex[]) ?? [];
      const paid = (args.payouts as bigint[]) ?? [];
      return `settled: ${winners.map((w, i) => `${short(w)} +${mon(paid[i])}`).join(", ")}`;
    }
    case "CollectiveFail":
      return "nobody completed — stakes refunded";
    case "Aborted":
      return "circle aborted, everyone refunded";
    default:
      return name;
  }
}
