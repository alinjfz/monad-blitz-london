"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeEventLog, formatEther, keccak256, parseEther, type Hex } from "viem";
import { focusBondAbi } from "@/lib/abi";
import {
  ACTORS,
  explorerAddress,
  explorerTx,
  focusBondAddress,
  publicClient,
  type Actor,
} from "@/lib/chain";

const PRESETS = [
  { label: "Blitz Lock-In", goal: "60 minutes heads-down building", round: 60, challenge: 30 },
  { label: "Job Hunt Sprint", goal: "Apply to 5 jobs, screenshot each sent email", round: 120, challenge: 60 },
  { label: "LeetCode Daily", goal: "One accepted submission", round: 120, challenge: 60 },
  { label: "Gym Streak", goal: "Workout photo before midnight", round: 120, challenge: 60 },
  { label: "Off TikTok", goal: "Under 30 minutes of short-form video", round: 120, challenge: 60 },
  { label: "Thesis Hours", goal: "Two hours of writing, screenshot the word count", round: 180, challenge: 60 },
];

const MILESTONES = [3, 7, 30];

type Stats = {
  streak: number;
  bestStreak: number;
  completed: number;
  missed: number;
  earned: bigint;
  lost: bigint;
};

type MemberView = {
  addr: Hex;
  proofHash: Hex;
  verified: boolean;
  failedByAI: boolean;
  broke: boolean;
  challenger: Hex;
  completer: boolean;
  stats: Stats;
};

type Circle = {
  stake: bigint;
  goal: string;
  roundSeconds: bigint;
  challengeSeconds: bigint;
  endsAt: bigint;
  challengeEndsAt: bigint;
  settled: boolean;
  members: readonly Hex[];
  escrow: bigint;
};

type FeedItem = { key: string; name: string; text: string; hash: Hex };
type Verdict = { pass: boolean | null; reason: string; source: string };

const ZERO = "0x0000000000000000000000000000000000000000";
const mon = (v: bigint, dp = 4) => Number(formatEther(v)).toFixed(dp);
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export default function Home() {
  const [actors, setActors] = useState<Record<string, string>>({});
  const [circleId, setCircleId] = useState<bigint | null>(null);
  const [circle, setCircle] = useState<Circle | null>(null);
  const [board, setBoard] = useState<MemberView[]>([]);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [blockNumber, setBlockNumber] = useState<bigint>(0n);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preset, setPreset] = useState(0);
  // Big enough that the redistribution clearly dominates gas on screen.
  const [stakeInput, setStakeInput] = useState("0.3");

  const fromBlock = useRef<bigint | null>(null);
  const configured = focusBondAddress !== ZERO;

  // ------------------------------------------------------------- data load

  const refresh = useCallback(async () => {
    if (!configured) return;
    try {
      const [count, bn] = await Promise.all([
        publicClient.readContract({ address: focusBondAddress, abi: focusBondAbi, functionName: "circleCount" }),
        publicClient.getBlockNumber(),
      ]);
      setBlockNumber(bn);

      const id = circleId ?? (count > 0n ? (count as bigint) : null);
      if (id !== circleId) setCircleId(id);

      if (id !== null) {
        const [raw, brd] = await Promise.all([
          publicClient.readContract({
            address: focusBondAddress,
            abi: focusBondAbi,
            functionName: "getCircle",
            args: [id],
          }),
          publicClient.readContract({
            address: focusBondAddress,
            abi: focusBondAbi,
            functionName: "getBoard",
            args: [id],
          }),
        ]);
        const c = raw as readonly unknown[];
        setCircle({
          stake: c[0] as bigint,
          goal: c[1] as string,
          roundSeconds: c[2] as bigint,
          challengeSeconds: c[3] as bigint,
          endsAt: c[4] as bigint,
          challengeEndsAt: c[5] as bigint,
          settled: c[6] as boolean,
          members: c[7] as readonly Hex[],
          escrow: c[8] as bigint,
        });
        setBoard(brd as unknown as MemberView[]);
      }

      const entries = await Promise.all(
        ACTORS.filter((a) => actors[a]).map(async (a) => {
          const balance = await publicClient.getBalance({ address: actors[a] as Hex });
          return [a, balance] as const;
        }),
      );
      setBalances(Object.fromEntries(entries));

      if (fromBlock.current === null) fromBlock.current = bn > 400n ? bn - 400n : 0n;
      const logs = await publicClient.getLogs({
        address: focusBondAddress,
        fromBlock: fromBlock.current,
        toBlock: "latest",
      });
      const items: FeedItem[] = [];
      for (const log of logs) {
        try {
          const ev = decodeEventLog({ abi: focusBondAbi, data: log.data, topics: log.topics });
          items.push({
            key: `${log.transactionHash}-${log.logIndex}`,
            name: ev.eventName,
            text: describe(ev.eventName, ev.args as Record<string, unknown>),
            hash: log.transactionHash,
          });
        } catch {
          // Unknown event shape, skip rather than break the feed.
        }
      }
      setFeed(items.reverse().slice(0, 40));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [actors, circleId, configured]);

  useEffect(() => {
    fetch("/api/actors")
      .then((r) => r.json())
      .then(setActors)
      .catch(() => setError("could not load demo wallets — is .env configured?"));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  // -------------------------------------------------------------- actions

  const call = useCallback(
    async (actor: Actor, fn: string, args: unknown[] = [], value?: bigint) => {
      setBusy(`${actor}: ${fn}`);
      setError(null);
      try {
        const res = await fetch("/api/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actor,
            fn,
            args: args.map((a) => (typeof a === "bigint" ? `${a}n` : a)),
            value: value !== undefined ? value.toString() : undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "transaction failed");
        setNotice(`${actor} → ${fn} confirmed`);
        await refresh();
        return body.hash as Hex;
      } catch (err) {
        setError(`${actor} ${fn}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const createCircle = async () => {
    const p = PRESETS[preset];
    const stake = parseEther(stakeInput || "0.1");
    setCircleId(null); // adopt whatever id the chain reports next
    await call("ALICE", "createCircle", [stake, `${p.label}: ${p.goal}`, BigInt(p.round), BigInt(p.challenge)], stake);
  };

  /// Commit the hash first so the deadline is met, then ask the referee. A slow
  /// or missing referee can never cost someone their stake.
  const checkIn = async (actor: Actor, file: File) => {
    if (circleId === null || !circle) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const proofHash = keccak256(bytes);

    const hash = await call(actor, "submitProof", [circleId, proofHash]);
    if (!hash) return;

    setBusy(`${actor}: referee reviewing`);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          circleId: circleId.toString(),
          member: actors[actor],
          proofHash,
          goal: circle.goal,
          filename: file.name,
          imageBase64: toBase64(bytes),
        }),
      });
      const verdict = await res.json();
      setVerdicts((v) => ({ ...v, [actor]: verdict }));
      if (verdict.signature) {
        await call(actor, "attest", [circleId, actors[actor], verdict.pass, verdict.signature]);
      }
    } catch (err) {
      setVerdicts((v) => ({
        ...v,
        [actor]: { pass: null, reason: err instanceof Error ? err.message : String(err), source: "error" },
      }));
    } finally {
      setBusy(null);
    }
  };

  // --------------------------------------------------------------- derived

  const phase = useMemo(() => {
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

  const byAddress = useMemo(() => {
    const map: Record<string, Actor> = {};
    for (const a of ACTORS) if (actors[a]) map[actors[a].toLowerCase()] = a;
    return map;
  }, [actors]);

  const nameOf = (addr?: string) => (addr ? byAddress[addr.toLowerCase()] ?? short(addr) : "");

  const pending = board.filter((m) => m.proofHash === `0x${"0".repeat(64)}` && !m.broke);
  const potAtStake = circle ? circle.stake * BigInt(board.filter((m) => !m.completer).length) : 0n;
  const leaderboard = [...board].sort(
    (a, b) => b.stats.streak - a.stats.streak || Number(b.stats.earned - a.stats.earned),
  );

  const memberOf = (actor: Actor) =>
    board.find((m) => m.addr.toLowerCase() === (actors[actor] ?? "").toLowerCase());

  /// Settle is permissionless, so let whoever missed pay its gas. Otherwise the
  /// winners fund the payout that rewards them, which reads badly on stage.
  const settleActor: Actor = useMemo(() => {
    const misser = board.find((m) => !m.completer);
    const named = misser ? byAddress[misser.addr.toLowerCase()] : undefined;
    return named ?? "ALICE";
  }, [board, byAddress]);

  // ------------------------------------------------------------------ view

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <div className="brand">
            Focus<span>Bond</span>
          </div>
          <div className="tagline">
            Miss the challenge, pay the friends who showed up. Escrowed on Monad, settled in one transaction.
          </div>
        </div>
        <div className="chainbar">
          <span>
            <span className="pulse" />
            Monad Testnet
          </span>
          <span>block {blockNumber.toString()}</span>
          {configured ? (
            <a href={explorerAddress(focusBondAddress)} target="_blank" rel="noreferrer">
              {short(focusBondAddress)}
            </a>
          ) : (
            <span className="loss">contract not configured</span>
          )}
        </div>
      </header>

      {!configured && (
        <div className="alert err">
          Set <code>NEXT_PUBLIC_FOCUSBOND_ADDRESS</code> in <code>web/.env.local</code> to the deployed address, then
          reload.
        </div>
      )}
      {error && <div className="alert err">{error}</div>}
      {notice && !error && <div className="alert ok">{notice}</div>}

      {phase === "focus" && pending.length > 0 && (
        <div className="alert risk">
          {pending.length === 1 ? (
            <>
              <b>{nameOf(pending[0].addr)} is the last one left.</b> {mon(circle!.stake)} MON goes to everyone else in{" "}
              {fmtClock(secondsLeft)} unless they check in.
            </>
          ) : (
            <>
              <b>{pending.length} friends have not checked in.</b> {mon(potAtStake)} MON is on the line with{" "}
              {fmtClock(secondsLeft)} left.
            </>
          )}
        </div>
      )}

      <div className="grid-top">
        <div className="panel">
          <h2>Challenge</h2>
          <div className="row">
            <div style={{ flex: 2 }}>
              <label className="field">Preset goal</label>
              <select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
                {PRESETS.map((p, i) => (
                  <option key={p.label} value={i}>
                    {p.label} — {p.goal}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field">Stake each (MON)</label>
              <input type="text" value={stakeInput} onChange={(e) => setStakeInput(e.target.value)} />
            </div>
          </div>

          <div className="btnrow">
            <button className="primary" onClick={createCircle} disabled={!!busy || !configured}>
              Alice creates circle
            </button>
            <button
              onClick={() => circleId !== null && circle && call("BOB", "join", [circleId], circle.stake)}
              disabled={!!busy || phase !== "lobby"}
            >
              Bob joins
            </button>
            <button
              onClick={() => circleId !== null && circle && call("CARA", "join", [circleId], circle.stake)}
              disabled={!!busy || phase !== "lobby"}
            >
              Cara joins
            </button>
            <button
              className="primary"
              onClick={() => circleId !== null && call("ALICE", "start", [circleId])}
              disabled={!!busy || phase !== "lobby" || board.length < 2}
            >
              Start round
            </button>
            <button
              className="danger"
              onClick={() => circleId !== null && call("ALICE", "abort", [circleId])}
              disabled={!!busy || phase !== "lobby"}
            >
              Abort &amp; refund
            </button>
          </div>

          {circle && circle.stake > 0n && (
            <div className="sub" style={{ marginTop: 12 }}>
              Circle #{circleId?.toString()} · {circle.goal} · {board.length} members · round{" "}
              {circle.roundSeconds.toString()}s · challenge window {circle.challengeSeconds.toString()}s
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Round</h2>
          <div className="phase">{phaseLabel(phase)}</div>
          <div className={`clock ${phase === "focus" && secondsLeft <= 15 ? "urgent" : ""}`}>
            {phase === "focus" || phase === "challenge" ? fmtClock(secondsLeft) : "--:--"}
          </div>
          <div className="sub">
            {phase === "focus"
              ? "check in before this hits zero"
              : phase === "challenge"
                ? "friends can dispute unverified check-ins"
                : phase === "ready"
                  ? "anyone can settle now"
                  : phase === "settled"
                    ? "settled — escrow drained to members"
                    : "waiting for members"}
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="pot">{mon(circle?.escrow ?? 0n)} MON</div>
            <div className="sub">held in escrow · {mon(potAtStake)} MON currently at risk</div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              className="settle"
              onClick={() => circleId !== null && call(settleActor, "settle", [circleId])}
              disabled={!!busy || phase !== "ready"}
            >
              Settle — pay the friends who showed up
            </button>
            <div className="sub" style={{ marginTop: 8 }}>
              anyone can call this; {settleActor} is triggering it
            </div>
          </div>
          {busy && <div className="sub" style={{ marginTop: 10 }}>{busy}…</div>}
        </div>
      </div>

      <div className="grid-cols">
        {ACTORS.map((actor) => {
          const m = memberOf(actor);
          const verdict = verdicts[actor];
          return (
            <div
              key={actor}
              className={`member ${m?.completer ? "completer" : m && phase !== "lobby" ? "misser" : ""}`}
            >
              <div className="member-head">
                <div>
                  <div className="who">{actor}</div>
                  <div className="addr">
                    {actors[actor] ? (
                      <a
                        href={explorerAddress(actors[actor])}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "inherit" }}
                      >
                        {short(actors[actor])}
                      </a>
                    ) : (
                      "no wallet"
                    )}
                  </div>
                  <div className="flame">
                    {m ? `${"🔥".repeat(Math.min(m.stats.streak, 5))} streak ${m.stats.streak}` : "streak 0"}
                  </div>
                </div>
                <div className="bal">
                  {mon(balances[actor] ?? 0n, 3)}
                  <br />
                  <small>MON</small>
                </div>
              </div>

              <div>{statusBadge(m, phase)}</div>

              {m && (
                <>
                  <div style={{ marginTop: 12 }}>
                    <div className="stat-line">
                      <span className="dim">Personal best</span>
                      <span>{m.stats.bestStreak}</span>
                    </div>
                    <div className="stat-line">
                      <span className="dim">Earned from misses</span>
                      <span className="gain">+{mon(m.stats.earned)}</span>
                    </div>
                    <div className="stat-line">
                      <span className="dim">Lost to friends</span>
                      <span className="loss">-{mon(m.stats.lost)}</span>
                    </div>
                    <div className="stat-line">
                      <span className="dim">Completion rate</span>
                      <span>{rate(m.stats)}</span>
                    </div>
                    <div className="sub" style={{ marginTop: 8 }}>
                      next milestone {nextMilestone(m.stats.streak)}
                      <div className="milestone">
                        <div style={{ width: `${milestonePct(m.stats.streak)}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="filedrop">
                    upload proof (hashed in your browser, image never stored)
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!!busy || phase !== "focus"}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) checkIn(actor, f);
                      }}
                    />
                  </div>

                  {verdict && (
                    <div className="verdict">
                      <span
                        className={verdict.pass === true ? "gain" : verdict.pass === false ? "loss" : "dim"}
                      >
                        referee: {verdict.pass === true ? "PASS" : verdict.pass === false ? "FAIL" : "no verdict"}
                      </span>{" "}
                      <span className="dim">
                        ({verdict.source}) {verdict.reason}
                      </span>
                    </div>
                  )}

                  <div className="btnrow">
                    <button
                      className="danger"
                      onClick={() => circleId !== null && call(actor, "breakFocus", [circleId])}
                      disabled={!!busy || phase !== "focus"}
                    >
                      Break focus
                    </button>
                    {ACTORS.filter((o) => o !== actor).map((target) => (
                      <button
                        key={target}
                        onClick={() =>
                          circleId !== null &&
                          circle &&
                          call(actor, "challenge", [circleId, actors[target]], circle.stake)
                        }
                        disabled={!!busy || phase !== "challenge"}
                        title={`Post a ${mon(circle?.stake ?? 0n)} MON bond to dispute ${target}`}
                      >
                        Dispute {target}
                      </button>
                    ))}
                    {ACTORS.filter((o) => o !== actor).map((target) => (
                      <button
                        key={`nudge-${target}`}
                        onClick={() => circleId !== null && call(actor, "nudge", [circleId, actors[target]])}
                        disabled={!!busy || phase === "none" || phase === "lobby"}
                      >
                        Nudge {target}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid-bottom">
        <div className="panel">
          <h2>Leaderboard</h2>
          <table>
            <thead>
              <tr>
                <th>Friend</th>
                <th>Streak</th>
                <th>Best</th>
                <th>Net</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((m) => {
                const net = m.stats.earned - m.stats.lost;
                return (
                  <tr key={m.addr}>
                    <td className="name">{nameOf(m.addr)}</td>
                    <td>{m.stats.streak}</td>
                    <td>{m.stats.bestStreak}</td>
                    <td className={net >= 0n ? "gain" : "loss"}>
                      {net >= 0n ? "+" : "-"}
                      {mon(net >= 0n ? net : -net)}
                    </td>
                    <td>{rate(m.stats)}</td>
                  </tr>
                );
              })}
              {leaderboard.length === 0 && (
                <tr>
                  <td className="dim" colSpan={5}>
                    no circle yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="sub" style={{ marginTop: 12 }}>
            Nudges are onchain because on Monad they cost a fraction of a cent.
          </div>
        </div>

        <div className="panel">
          <h2>Onchain activity</h2>
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
            {feed.length === 0 && <div className="dim">no events yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ helpers

function phaseLabel(phase: string) {
  return (
    {
      none: "no circle",
      lobby: "lobby — waiting to start",
      focus: "focus round live",
      challenge: "challenge window",
      ready: "ready to settle",
      settled: "settled",
    } as Record<string, string>
  )[phase] ?? phase;
}

function fmtClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function statusBadge(m: MemberView | undefined, phase: string) {
  if (!m) return <span className="badge waiting">not in circle</span>;
  if (m.broke) return <span className="badge failed">broke focus</span>;
  if (m.failedByAI) return <span className="badge failed">referee rejected</span>;
  if (m.proofHash === `0x${"0".repeat(64)}`) {
    return <span className="badge waiting">{phase === "focus" ? "not checked in" : "missed"}</span>;
  }
  if (m.challenger !== ZERO && !m.verified) return <span className="badge challenged">disputed</span>;
  if (m.verified) return <span className="badge verified">verified by referee</span>;
  return <span className="badge unverified">committed, unverified</span>;
}

function rate(s: Stats) {
  const total = s.completed + s.missed;
  return total === 0 ? "—" : `${Math.round((s.completed / total) * 100)}%`;
}

function nextMilestone(streak: number) {
  const next = MILESTONES.find((m) => m > streak);
  return next ? `${streak}/${next}` : "all cleared";
}

function milestonePct(streak: number) {
  const next = MILESTONES.find((m) => m > streak);
  if (!next) return 100;
  const prev = [0, ...MILESTONES].filter((m) => m <= streak).pop() ?? 0;
  return Math.round(((streak - prev) / (next - prev)) * 100);
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
      return `${s("challenger")} disputed ${s("member")} with a ${mon(args.bond as bigint)} MON bond`;
    case "ChallengeResolved":
      return `dispute against ${s("member")} ${args.succeeded ? "succeeded" : "failed — bond forfeited"}`;
    case "FocusBroken":
      return `${s("member")} broke focus`;
    case "Nudged":
      return `${s("from")} nudged ${s("to")}`;
    case "Slashed":
      return `${s("member")} slashed ${mon(args.amount as bigint)} MON`;
    case "Settled": {
      const winners = (args.completers as Hex[]) ?? [];
      const paid = (args.payouts as bigint[]) ?? [];
      return `settled: ${winners.map((w, i) => `${short(w)} +${mon(paid[i])}`).join(", ")}`;
    }
    case "CollectiveFail":
      return "nobody completed — stakes refunded, streaks reset";
    case "Aborted":
      return "circle aborted, everyone refunded";
    case "PayoutDeferred":
      return `payout to ${s("to")} deferred to withdraw()`;
    default:
      return name;
  }
}
