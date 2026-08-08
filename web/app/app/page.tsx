"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type ClockAnchor = {
  endsAt: bigint;
  challengeEndsAt: bigint;
  focusDeadlineMs: number;
  challengeDeadlineMs: number;
};

function sameCircle(a: Circle, b: Circle) {
  return (
    a.stake === b.stake &&
    a.goal === b.goal &&
    a.roundSeconds === b.roundSeconds &&
    a.challengeSeconds === b.challengeSeconds &&
    a.endsAt === b.endsAt &&
    a.challengeEndsAt === b.challengeEndsAt &&
    a.settled === b.settled &&
    a.escrow === b.escrow &&
    a.members.length === b.members.length &&
    a.members.every((m, i) => m.toLowerCase() === b.members[i]?.toLowerCase())
  );
}

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
  const [tick, setTick] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const autoSettleRef = useRef<string | null>(null);
  const clockAnchorRef = useRef<ClockAnchor | null>(null);

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
          clockAnchorRef.current = null;
        } else {
          setCircle((prev) => (prev && sameCircle(prev, next) ? prev : next));
          const nextBoard = (body.board as MemberView[]).map((m) => ({
            ...m,
            stats: {
              ...m.stats,
              earned: BigInt(String(m.stats.earned)),
              lost: BigInt(String(m.stats.lost)),
            },
          }));
          setBoard((prev) => {
            if (
              prev.length === nextBoard.length &&
              prev.every(
                (p, i) =>
                  p.addr === nextBoard[i]?.addr &&
                  p.proofHash === nextBoard[i]?.proofHash &&
                  p.broke === nextBoard[i]?.broke &&
                  p.verified === nextBoard[i]?.verified &&
                  p.failedByAI === nextBoard[i]?.failedByAI &&
                  p.completer === nextBoard[i]?.completer,
              )
            ) {
              return prev;
            }
            return nextBoard;
          });
        }
      } else if (id === null) {
        setCircle(null);
        setBoard([]);
      }

      if (Array.isArray(body.feed)) {
        const next = body.feed.map(
          (f: { key: string; name: string; args: Record<string, unknown>; hash: Hex }) => ({
            key: f.key,
            name: f.name,
            text: describe(f.name, reviveArgs(f.args)),
            hash: f.hash,
          }),
        );
        setFeed((prev) => {
          if (
            prev.length === next.length &&
            prev.every((p, i) => p.key === next[i]?.key && p.hash === next[i]?.hash)
          ) {
            return prev;
          }
          return next;
        });
        try {
          localStorage.setItem("focusbond:feed", JSON.stringify(next));
        } catch {
          /* ignore quota */
        }
      }

      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Public RPC rate-limits / flakes — never scare the demo UI.
      if (isRpcNoise(message)) return;
      setError(friendlyRpcError(err, "Couldn’t refresh — try again."));
    }
  }, [address, circleId]);

  // Smooth local tick — one clock, no chain-time jitter every second.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);

  // Anchor countdown once per round start so refresh doesn't jump the display.
  useEffect(() => {
    if (!circle || circle.endsAt === 0n || circle.settled) {
      clockAnchorRef.current = null;
      return;
    }
    const prev = clockAnchorRef.current;
    if (
      prev &&
      prev.endsAt === circle.endsAt &&
      prev.challengeEndsAt === circle.challengeEndsAt
    ) {
      return;
    }
    const wallSec = Math.floor(Date.now() / 1000);
    clockAnchorRef.current = {
      endsAt: circle.endsAt,
      challengeEndsAt: circle.challengeEndsAt,
      focusDeadlineMs: Date.now() + Math.max(0, Number(circle.endsAt) - wallSec) * 1000,
      challengeDeadlineMs:
        Date.now() + Math.max(0, Number(circle.challengeEndsAt) - wallSec) * 1000,
    };
  }, [circle]);

  useEffect(() => {
    const s = loadSession();
    const params = new URLSearchParams(window.location.search);
    const join = params.get("join");
    const stored = loadCircleId();
    const initial = join && /^\d+$/.test(join) ? BigInt(join) : stored;
    if (join) setJoinId(join);
    if (s) setSession(s);
    if (initial !== null) setActiveCircle(initial);
    try {
      const cached = localStorage.getItem("focusbond:feed");
      if (cached) setFeed(JSON.parse(cached) as FeedItem[]);
    } catch {
      /* ignore */
    }
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
        if (fn !== "settle") setNotice(`${fn} confirmed`);
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
    roundSeconds,
    challengeSeconds,
  }: {
    preset: Preset;
    stakeMon: string;
    customGoal: string;
    roundSeconds: number;
    challengeSeconds: number;
  }) => {
    if (!session) {
      setError("Sign in first");
      return;
    }
    const stake = parseEther(stakeMon || "0.01");
    // Network gas only — the contract takes no fee / house cut.
    const gasBuffer = parseEther("0.01");
    if (walletBal < stake + gasBuffer) {
      setError(
        `Not enough MON. Need ~${mon(stake + gasBuffer, 3)} (stake ${stakeMon} + network gas). You have ${mon(walletBal, 3)}.`,
      );
      return;
    }
    const goal =
      preset.id === "custom"
        ? customGoal.trim()
        : `${preset.label}: ${customGoal.trim() || preset.goal}`;
    const result = await sendTx(
      "createCircle",
      [stake, goal, BigInt(roundSeconds), BigInt(challengeSeconds)],
      stake,
    );
    if (!result) return;

    const newId = result.circleId ? BigInt(result.circleId) : null;
    if (newId !== null) {
      autoSettleRef.current = null;
      clockAnchorRef.current = null;
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
    const gasBuffer = parseEther("0.01");
    if (walletBal < stake + gasBuffer) {
      setError(
        `Not enough MON to join. Need ~${mon(stake + gasBuffer, 3)} (stake + network gas). You have ${mon(walletBal, 3)}.`,
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
    void tick;
    if (!circle || circle.stake === 0n) return "none";
    if (circle.settled) return "settled";
    if (circle.endsAt === 0n) return "lobby";
    const anchor = clockAnchorRef.current;
    if (anchor) {
      if (Date.now() <= anchor.focusDeadlineMs) return "focus";
      if (Date.now() <= anchor.challengeDeadlineMs) return "challenge";
      return "ready";
    }
    const wall = Math.floor(Date.now() / 1000);
    if (wall <= Number(circle.endsAt)) return "focus";
    if (wall <= Number(circle.challengeEndsAt)) return "challenge";
    return "ready";
  }, [circle, tick]);

  // Auto-settle when the dispute window closes — no manual Settle button.
  useEffect(() => {
    if (phase !== "ready" || circleId === null || !session || busy) return;
    const key = circleId.toString();
    if (autoSettleRef.current === key) return;
    autoSettleRef.current = key;
    void (async () => {
      const result = await sendTx("settle", [circleId]);
      if (result) {
        setNotice("Settled — payouts sent to friends who showed up");
        await refresh(circleId);
      } else {
        autoSettleRef.current = null;
      }
    })();
  }, [phase, circleId, session, busy, sendTx, refresh]);

  // Keep lobby / live round in sync across browsers without manual refresh.
  useEffect(() => {
    if (!ready || !session || circleId === null) return;
    if (phase !== "lobby" && phase !== "focus") return;
    const t = setInterval(() => void refresh(circleId), 4000);
    return () => clearInterval(t);
  }, [ready, session, circleId, phase, refresh]);

  const secondsLeft = useMemo(() => {
    void tick;
    if (!circle || circle.endsAt === 0n || circle.settled) return 0;
    const anchor = clockAnchorRef.current;
    if (!anchor) return 0;
    if (Date.now() <= anchor.focusDeadlineMs) {
      return Math.max(0, Math.ceil((anchor.focusDeadlineMs - Date.now()) / 1000));
    }
    if (Date.now() <= anchor.challengeDeadlineMs) {
      return Math.max(0, Math.ceil((anchor.challengeDeadlineMs - Date.now()) / 1000));
    }
    return 0;
  }, [circle, tick]);

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

  const resolveJoin = async (raw?: string) => {
    const trimmed = (raw ?? joinId).trim().toUpperCase();
    if (!trimmed) {
      setError("Enter a challenge code to join");
      return;
    }
    setError(null);
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
  };

  const joinBar = (
    <div className="join-inline">
      <input
        className="field-input"
        value={joinId}
        onChange={(e) => setJoinId(e.target.value.toUpperCase())}
        placeholder="Challenge code"
        spellCheck={false}
        autoCapitalize="characters"
        onKeyDown={(e) => e.key === "Enter" && void resolveJoin()}
      />
      <button
        type="button"
        className="btn btn-primary"
        disabled={!joinId || !!busy}
        onClick={() => void resolveJoin()}
      >
        Join challenge
      </button>
    </div>
  );

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
          <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(true)}>
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
            <h1>Join or create a challenge</h1>
            <p>Enter a friend’s challenge code to stake in, or create Gym Streak and share yours.</p>
            <div className="ongoing-empty-actions">
              {joinBar}
              <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(true)}>
                + New challenge
              </button>
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
                    <b>{nameOf(pending[0].addr)} hasn’t checked in.</b> {mon(circle!.stake)} MON on the
                    line.
                  </>
                ) : (
                  <>
                    <b>{pending.length} friends have not checked in.</b> {mon(potAtStake)} MON at risk.
                  </>
                )}
              </div>
            )}

            {phase === "lobby" && (
              <div className="alert risk">
                {board.length < 2 ? (
                  <>
                    <b>Need a second friend.</b> Open another browser as Alice or Bob, then join with
                    code <code>{circleId !== null ? toInviteCode(circleId) : "—"}</code>. Clock and
                    upload start after <b>Start round</b>.
                  </>
                ) : (
                  <>
                    <b>Both friends are in.</b> Hit <b>Start round</b> — the timer runs and upload
                    appears.
                  </>
                )}
              </div>
            )}

            {phase === "settled" && (
              <div className="alert ok">
                Round paid out. Join a friend’s open challenge with their code, or create a new Gym
                Streak.
              </div>
            )}

            <div className="ongoing-actions">
              {phase === "lobby" && iAmMember && board.length >= 2 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!!busy}
                  onClick={() =>
                    sendTx("start", [circleId!]).then((r) => {
                      if (r) void refresh(circleId);
                    })
                  }
                >
                  Start round
                </button>
              )}
              {phase === "lobby" && iAmMember && board.length < 2 && (
                <span className="busy-label">Waiting for friend to join…</span>
              )}
              {phase === "lobby" && iAmMember && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={!!busy}
                  onClick={() =>
                    sendTx("abort", [circleId!]).then((r) => {
                      if (r) void refresh(circleId);
                    })
                  }
                >
                  Abort &amp; refund
                </button>
              )}
              {phase === "lobby" && !iAmMember && session && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!!busy}
                  onClick={() => joinCircle(circleId!)}
                >
                  Join challenge · stake {mon(circle?.stake ?? 0n)} MON
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
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={!!busy}
                  onClick={() =>
                    sendTx("breakFocus", [circleId!]).then((r) => {
                      if (r) void refresh(circleId);
                    })
                  }
                >
                  Break focus
                </button>
              )}
              {phase === "ready" && <span className="busy-label">Settling payouts…</span>}
              {phase === "settled" && (
                <>
                  {joinBar}
                  <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(true)}>
                    + New challenge
                  </button>
                </>
              )}
              {phase === "lobby" && (
                <button type="button" className="btn btn-ghost" onClick={copyInvite} disabled={circleId === null}>
                  {inviteCopied ? "Copied!" : "Copy invite code"}
                </button>
              )}
              {busy && busy !== "settle" && <span className="busy-label">{busy}…</span>}
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
