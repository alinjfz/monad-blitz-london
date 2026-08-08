"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { keccak256, parseEther, type Hex } from "viem";
import { BrandMark } from "@/components/BrandMark";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { CreateChallengeModal } from "@/components/CreateChallengeModal";
import { InviteFriends, fromInviteCode, toInviteCode } from "@/components/InviteFriends";
import { ChallengePanel } from "@/components/ChallengePanel";
import { SignInButton } from "@/components/SignInButton";
import { explorerAddress, explorerTx, FAUCET_URL } from "@/lib/chain";
import { fmtClock, mon, phaseLabel, short, ZERO, ZERO_HASH } from "@/lib/format";
import { SESSION_KEY, friendByUsername, type FriendSession } from "@/lib/friends";
import { isRpcNoise, friendlyRpcError } from "@/lib/rpc";
import type { Circle, FeedItem, MemberView, Phase, Verdict } from "@/lib/types";
import type { Preset } from "@/lib/presets";

const CIRCLE_KEY = "focusbond:circleId";

function loadSession(): FriendSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as FriendSession;
    if (!s.code) {
      const f = friendByUsername(s.username);
      if (f) s.code = f.code;
    }
    return s;
  } catch {
    return null;
  }
}

function loadCircleId(): bigint | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(CIRCLE_KEY);
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : null;
}

export default function AppPage() {
  const router = useRouter();
  const [session, setSession] = useState<FriendSession | null>(null);
  const [actorMap, setActorMap] = useState<Record<string, string>>({});
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
  const [ready, setReady] = useState(false);

  const address = session?.address as Hex | undefined;

  const setActiveCircle = (id: bigint | null) => {
    setCircleId(id);
    if (id === null) localStorage.removeItem(CIRCLE_KEY);
    else localStorage.setItem(CIRCLE_KEY, id.toString());
  };

  const refresh = useCallback(async (idOverride?: bigint | null) => {
    const id = idOverride !== undefined ? idOverride : circleId;
    try {
      const params = new URLSearchParams();
      if (id !== null && id !== undefined) params.set("id", id.toString());
      if (address) params.set("address", address);
      params.set("logs", "1");

      const res = await fetch(`/api/circle?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "refresh failed");

      if (body.balance) setWalletBal(BigInt(body.balance));

      if (body.circle) {
        const c = body.circle;
        const next: Circle = {
          stake: BigInt(c.stake),
          goal: c.goal,
          roundSeconds: BigInt(c.roundSeconds),
          challengeSeconds: BigInt(c.challengeSeconds),
          endsAt: BigInt(c.endsAt),
          challengeEndsAt: BigInt(c.challengeEndsAt),
          settled: c.settled,
          members: c.members,
          escrow: BigInt(c.escrow),
        };
        if (next.stake === 0n && next.members.length === 0) {
          setCircle(null);
          setBoard([]);
          setActiveCircle(null);
        } else {
          setCircle(next);
          setBoard(
            (body.board as MemberView[]).map((m) => ({
              ...m,
              stats: {
                ...m.stats,
                earned: BigInt(String(m.stats.earned)),
                lost: BigInt(String(m.stats.lost)),
              },
            })),
          );
        }
      } else if (id === null) {
        setCircle(null);
        setBoard([]);
      }

      if (Array.isArray(body.feed)) {
        setFeed(
          body.feed.map((f: { key: string; name: string; args: Record<string, unknown>; hash: Hex }) => ({
            key: f.key,
            name: f.name,
            text: describe(f.name, reviveArgs(f.args)),
            hash: f.hash,
          })),
        );
      }

      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Public RPC rate-limits / flakes — never scare the demo UI.
      if (isRpcNoise(message)) return;
      setError(friendlyRpcError(err, "Couldn’t refresh — try again."));
    }
  }, [address, circleId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const s = loadSession();
    const params = new URLSearchParams(window.location.search);
    const join = params.get("join");
    const stored = loadCircleId();
    const initial = join && /^\d+$/.test(join) ? BigInt(join) : stored;
    if (join) setJoinId(join);
    if (s) setSession(s);
    if (initial !== null) setActiveCircle(initial);
    setReady(true);
    fetch("/api/actors")
      .then((r) => r.json())
      .then((actors: Record<string, string>) => {
        const map: Record<string, string> = {};
        for (const [name, addr] of Object.entries(actors)) {
          if (addr) map[addr.toLowerCase()] = name.charAt(0) + name.slice(1).toLowerCase();
        }
        setActorMap(map);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (session) return;
    const params = new URLSearchParams(window.location.search);
    const join = params.get("join");
    router.replace(join ? `/?join=${encodeURIComponent(join)}` : "/");
  }, [ready, session, router]);

  useEffect(() => {
    if (!ready || !session) return;
    void refresh(circleId);
  }, [ready, session?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  const login = (s: FriendSession) => {
    const withCode = s.code ? s : { ...s, code: friendByUsername(s.username)?.code ?? "" };
    localStorage.setItem(SESSION_KEY, JSON.stringify(withCode));
    setSession(withCode);
    setNotice(
      withCode.code
        ? `Signed in as ${withCode.displayName} · friend code ${withCode.code}`
        : `Signed in as ${withCode.displayName}`,
    );
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    router.replace("/");
  };

  const sendTx = useCallback(
    async (fn: string, args: unknown[] = [], value?: bigint) => {
      if (!session) {
        setError("Sign in as Alice, Bob, or Cara first");
        return null;
      }
      setBusy(fn);
      setError(null);
      try {
        const res = await fetch("/api/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actor: session.actor,
            fn,
            args: args.map((a) => (typeof a === "bigint" ? `${a}n` : a)),
            value: value !== undefined ? value.toString() : undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "transaction failed");
        if (body.balance) setWalletBal(BigInt(body.balance));
        setNotice(`${fn} confirmed`);
        return body as { hash: Hex; circleId?: string };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(isRpcNoise(message) ? "Network busy — tap again in a second." : friendlyRpcError(err));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [session],
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
    if (!session) {
      setError("Sign in first");
      return;
    }
    const stake = parseEther(stakeMon || "0.02");
    // Gas is charged on the limit on Monad — leave a small buffer above stake.
    const gasBuffer = parseEther("0.05");
    if (walletBal < stake + gasBuffer) {
      setError(
        `Not enough MON. Need ~${mon(stake + gasBuffer, 3)} (stake ${stakeMon} + gas). You have ${mon(walletBal, 3)}.`,
      );
      return;
    }
    const goal = `${preset.label}: ${customGoal.trim() || preset.goal}`;
    const result = await sendTx(
      "createCircle",
      [stake, goal, BigInt(preset.round), BigInt(preset.challenge)],
      stake,
    );
    if (!result) return;

    const newId = result.circleId ? BigInt(result.circleId) : null;
    if (newId !== null) {
      setActiveCircle(newId);
      await refresh(newId);
      setNotice(`Challenge #${newId.toString()} created. Copy the invite for friends`);
    } else {
      await refresh();
      setNotice("Challenge created. Hit Refresh if it doesn’t appear");
    }
    setCreateOpen(false);
  };

  const joinCircle = async (id: bigint) => {
    if (!session) {
      setError("Sign in first to join");
      return;
    }
    setActiveCircle(id);
    await refresh(id);
    // Fetch stake via our API, then join
    const res = await fetch(`/api/circle?id=${id.toString()}`);
    const body = await res.json();
    if (!res.ok || !body.circle) {
      setError(body.error ?? `Circle #${id.toString()} not found`);
      return;
    }
    const stake = BigInt(body.circle.stake);
    if (stake === 0n) {
      setError(`Circle #${id.toString()} is empty`);
      return;
    }
    const gasBuffer = parseEther("0.05");
    if (walletBal < stake + gasBuffer) {
      setError(
        `Not enough MON to join. Need ~${mon(stake + gasBuffer, 3)} (stake + gas). You have ${mon(walletBal, 3)}.`,
      );
      return;
    }
    const result = await sendTx("join", [id], stake);
    if (result) await refresh(id);
  };

  const checkIn = async (file: File) => {
    if (circleId === null || !circle || !session || !address) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const proofHash = keccak256(bytes);
    const result = await sendTx("submitProof", [circleId, proofHash]);
    if (!result) return;

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
      await refresh(circleId);
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
    return actorMap[addr.toLowerCase()] ?? short(addr);
  };

  const friendCodeOf = (addr?: string) => {
    if (!addr) return null;
    const name = actorMap[addr.toLowerCase()];
    if (!name) return null;
    return friendByUsername(name)?.code ?? null;
  };

  const pending = board.filter((m) => m.proofHash === ZERO_HASH && !m.broke);
  const potAtStake = circle ? circle.stake * BigInt(board.filter((m) => !m.completer).length) : 0n;
  const iAmMember = !!address && board.some((m) => m.addr.toLowerCase() === address.toLowerCase());
  const myMember = address
    ? board.find((m) => m.addr.toLowerCase() === address.toLowerCase())
    : undefined;

  const copyInvite = async () => {
    if (circleId === null) return;
    await navigator.clipboard.writeText(toInviteCode(circleId));
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  if (!ready || !session) {
    return null;
  }

  return (
    <div className="app-shell">
      <header className="app-top">
        <div className="app-top-left">
          <Link href="/" className="brand-link">
            <BrandMark />
          </Link>
          <a className="fund-link" href={FAUCET_URL} target="_blank" rel="noreferrer">
            Fund testnet wallet
          </a>
        </div>
        <div className="app-top-right">
          <div className="bal-chip">
            {mon(walletBal, 3)} <small>MON</small>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => refresh()} disabled={!!busy}>
            Refresh
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            + New challenge
          </button>
          <SignInButton session={session} onLogin={login} onLogout={logout} />
        </div>
      </header>

      {error && <div className="alert err">{error}</div>}
      {notice && !error && <div className="alert ok">{notice}</div>}

      <section className="ongoing">
        {phase === "none" ? (
          <div className="ongoing-empty">
            <h1>No challenge yet</h1>
            <p>Join a seeded challenge below, or create your own and share the challenge code.</p>
            <div className="ongoing-empty-actions">
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                Create challenge
              </button>
              <div className="join-inline">
                <input
                  className="field-input"
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value.toUpperCase())}
                  placeholder="LOCK1 or code"
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!joinId || !!busy}
                  onClick={async () => {
                    const trimmed = joinId.trim().toUpperCase();
                    const res = await fetch("/api/challenges", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ action: "resolve", code: trimmed }),
                    });
                    const body = await res.json();
                    if (res.ok && body.circleId) {
                      void joinCircle(BigInt(body.circleId));
                      return;
                    }
                    const id = fromInviteCode(trimmed);
                    if (id !== null) void joinCircle(id);
                    else setError(body.error ?? "Invalid challenge code");
                  }}
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
                    <b>{nameOf(pending[0].addr)} is last.</b> {mon(circle!.stake)} MON on the line in{" "}
                    {fmtClock(secondsLeft)}.
                  </>
                ) : (
                  <>
                    <b>{pending.length} friends have not checked in.</b> {mon(potAtStake)} MON at risk ·{" "}
                    {fmtClock(secondsLeft)} left.
                  </>
                )}
              </div>
            )}

            <div className="ongoing-actions">
              {phase === "lobby" && iAmMember && board.length >= 2 && (
                <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => sendTx("start", [circleId!]).then(() => refresh(circleId))}>
                  Start round
                </button>
              )}
              {phase === "lobby" && iAmMember && (
                <button type="button" className="btn btn-danger" disabled={!!busy} onClick={() => sendTx("abort", [circleId!]).then(() => refresh(circleId))}>
                  Abort &amp; refund
                </button>
              )}
              {phase === "lobby" && !iAmMember && session && (
                <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => joinCircle(circleId!)}>
                  Accept &amp; stake {mon(circle?.stake ?? 0n)} MON
                </button>
              )}
              {phase === "focus" && iAmMember && (
                <label className="file-btn">
                  Check in: upload proof
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
                <button type="button" className="btn btn-danger" disabled={!!busy} onClick={() => sendTx("breakFocus", [circleId!]).then(() => refresh(circleId))}>
                  Break focus
                </button>
              )}
              {phase === "ready" && (
                <button type="button" className="btn btn-settle" disabled={!!busy} onClick={() => sendTx("settle", [circleId!]).then(() => refresh(circleId))}>
                  Settle: pay the friends who showed up
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={copyInvite} disabled={circleId === null}>
                {inviteCopied ? "Copied!" : "Copy invite code"}
              </button>
              {busy && <span className="busy-label">{busy}…</span>}
            </div>

            {myMember && (
              <div className="my-status">
                {statusBadge(myMember, phase)}
                {address && verdicts[address] && (
                  <span className="verdict-inline">
                    Referee: {verdicts[address].pass === true ? "PASS" : verdicts[address].pass === false ? "FAIL" : "pending"} (
                    {verdicts[address].source})
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <div className="app-grid">
        <div className="app-stack">
          <CollapsiblePanel title="Friends" hint={<span>Codes · add</span>}>
            <InviteFriends username={session.username} busy={!!busy} />
          </CollapsiblePanel>

          <CollapsiblePanel
            title="Challenges"
            hint={<span>{board.length ? `${board.length} members` : "Join · create"}</span>}
          >
            <ChallengePanel
              circleId={circleId}
              challengeCode={circleId !== null ? toInviteCode(circleId) : null}
              onJoinChallenge={joinCircle}
              onCreate={() => setCreateOpen(true)}
              busy={!!busy}
              members={
                <div className="friends-list">
                  {board.length === 0 && (
                    <p className="dim">Challenge members show up here after they join with the challenge code.</p>
                  )}
                  {board.map((m) => (
                    <div
                      key={m.addr}
                      className={`friend-row ${m.completer ? "ok" : phase !== "lobby" && phase !== "none" ? "risk" : ""}`}
                    >
                      <div>
                        <strong>{nameOf(m.addr)}</strong>
                        {friendCodeOf(m.addr) && (
                          <p className="friend-link-code" style={{ margin: "0.15rem 0 0" }}>
                            {friendCodeOf(m.addr)}
                          </p>
                        )}
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
                            onClick={() => sendTx("nudge", [circleId!, m.addr]).then(() => refresh(circleId))}
                          >
                            Nudge
                          </button>
                        )}
                        {phase === "challenge" && address && m.addr.toLowerCase() !== address.toLowerCase() && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={!!busy}
                            onClick={() =>
                              sendTx("challenge", [circleId!, m.addr], circle?.stake).then(() => refresh(circleId))
                            }
                          >
                            Dispute
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              }
            />
          </CollapsiblePanel>
        </div>

        <CollapsiblePanel
          title="Onchain activity"
          className="activity-panel"
          hint={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => refresh()} disabled={!!busy}>
              Refresh
            </button>
          }
        >
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
            {feed.length === 0 && <div className="dim">No events yet</div>}
          </div>
        </CollapsiblePanel>
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

function reviveArgs(args: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string" && /^\d+$/.test(v) && (k.includes("stake") || k.includes("amount") || k === "id" || k.includes("Seconds") || k.includes("bond") || k.includes("payout"))) {
      out[k] = BigInt(v);
    } else if (Array.isArray(v)) {
      out[k] = v.map((x) => (typeof x === "string" && /^\d+$/.test(x) ? BigInt(x) : x));
    } else {
      out[k] = v;
    }
  }
  return out;
}

function describe(name: string, args: Record<string, unknown>) {
  const a = (k: string) => String(args[k] ?? "");
  const s = (k: string) => short(a(k));
  switch (name) {
    case "CircleCreated":
      return `${s("creator")} opened "${a("goal")}" at ${mon(BigInt(String(args.stake ?? 0)))} MON each`;
    case "Joined":
      return `${s("member")} staked ${mon(BigInt(String(args.stake ?? 0)))} MON`;
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
      return `settled: ${winners.map((w, i) => `${short(w)} +${mon(BigInt(String(paid[i] ?? 0)))}`).join(", ")}`;
    }
    case "CollectiveFail":
      return "nobody completed, stakes refunded";
    case "Aborted":
      return "circle aborted, everyone refunded";
    default:
      return name;
  }
}
