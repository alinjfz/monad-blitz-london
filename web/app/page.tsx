"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { PhoneShowcase } from "@/components/PhoneShowcase";
import { SignInButton } from "@/components/SignInButton";
import { SESSION_KEY, friendByUsername, type FriendSession } from "@/lib/friends";

const STEPS = [
  {
    n: "01",
    title: "Create a challenge",
    body: "Pick a goal, a deadline, how you'll prove it, and how much each person stakes in MON.",
  },
  {
    n: "02",
    title: "Invite your friends",
    body: "Share a link. Friends connect a wallet or Google, fund on testnet, and join the circle.",
  },
  {
    n: "03",
    title: "Everyone stakes",
    body: "MON goes into escrow on Monad, not into our pocket. The contract cannot keep a single wei.",
  },
  {
    n: "04",
    title: "Check in with proof",
    body: "Submit a screenshot before the timer hits zero. Hashed in your browser. Never stored.",
  },
  {
    n: "05",
    title: "Miss once, pay your friends",
    body: "Whoever misses has their entire stake split among the friends who showed up. Settled in one transaction.",
  },
];

const EXAMPLES = [
  { title: "30-Day Fitness", meta: "Daily · gym photo", stake: "$10" },
  { title: "Finals Sprint", meta: "Mon-Fri · timelapse", stake: "$15" },
  { title: "Off TikTok", meta: "21 days · screen time", stake: "$10" },
  { title: "Job Hunt Sprint", meta: "Weekly · email screenshots", stake: "$20" },
];

function loadSession(): FriendSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as FriendSession) : null;
  } catch {
    return null;
  }
}

function appHref() {
  if (typeof window === "undefined") return "/app";
  const join = new URLSearchParams(window.location.search).get("join");
  return join ? `/app?join=${encodeURIComponent(join)}` : "/app";
}

export default function LandingPage() {
  const router = useRouter();
  const [session, setSession] = useState<FriendSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  const goApp = (s?: FriendSession) => {
    if (s) {
      const withCode = s.code ? s : { ...s, code: friendByUsername(s.username)?.code ?? "" };
      localStorage.setItem(SESSION_KEY, JSON.stringify(withCode));
      setSession(withCode);
    }
    router.push(appHref());
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  return (
    <div className="landing">
      <nav className="land-nav">
        <Link href="/" className="brand-link">
          <BrandMark />
        </Link>
        <div className="land-nav-links">
          <a href="#how">How it works</a>
          <a href="#why">Why it works</a>
          {ready && session ? (
            <Link href={appHref()} className="btn btn-primary">
              Open app
            </Link>
          ) : (
            <SignInButton session={session} onLogin={goApp} onLogout={logout} />
          )}
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">Accountability circles on Monad</p>
          <h1 className="hero-title">
            Miss it,
            <br />
            <em>pay your friends.</em>
          </h1>
          <p className="hero-lede">
            Start a challenge with friends. Everyone stakes MON on a shared goal. Whoever misses has
            their stake split among the people who showed up. The contract keeps nothing.
          </p>
          <div className="hero-cta">
            {ready && session ? (
              <Link href={appHref()} className="btn btn-primary btn-lg">
                Open app
              </Link>
            ) : (
              <SignInButton
                session={session}
                onLogin={goApp}
                onLogout={logout}
                className="hero-signin"
                buttonLabel="Start a challenge"
              />
            )}
            <a href="#how" className="btn btn-ghost btn-lg">
              See how it works
            </a>
          </div>
          <p className="hero-note">Live on Monad Testnet · fund from the faucet · no card required</p>
        </div>
        <PhoneShowcase />
      </section>

      <section className="land-section" id="how">
        <h2 className="land-h2">How it works</h2>
        <p className="land-lede">Get started in minutes. Stay committed because money moves.</p>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="step-n">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="land-section contrast" id="why">
        <div className="why-layout">
          <div className="why-copy">
            <h2 className="land-h2">Why this one sticks</h2>
            <div className="why-grid">
              <article>
                <h3>Real stakes, real friends</h3>
                <p>
                  Like Nudge and Streek, but when someone misses, the money goes to the friends who
                  completed, not to the company.
                </p>
              </article>
              <article>
                <h3>Proof that counts</h3>
                <p>
                  Forfeit-grade check-ins: submit photo proof, get a referee verdict, or face a bonded
                  peer challenge. No empty green checkmarks.
                </p>
              </article>
              <article>
                <h3>No house cut</h3>
                <p>
                  Streek charges everyone and keeps it. Forfeit keeps the forfeit. FocusBond escrows the
                  group and drains to zero on every settle.
                </p>
              </article>
            </div>
          </div>
          <figure className="why-visual">
            <Image
              src="/brand/circle.webp"
              alt="Friends bonded around an escrow circle"
              width={900}
              height={675}
              sizes="(max-width: 900px) 90vw, 420px"
            />
          </figure>
        </div>
      </section>

      <section className="land-section">
        <h2 className="land-h2">Example challenges</h2>
        <div className="ex-grid">
          {EXAMPLES.map((e) => (
            <article key={e.title} className="ex-card">
              <h3>{e.title}</h3>
              <p>{e.meta}</p>
              <strong>{e.stake} per member</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="land-cta">
        <div className="land-cta-bg" aria-hidden>
          <Image src="/brand/hero.webp" alt="" fill sizes="100vw" className="land-cta-img" />
        </div>
        <div className="land-cta-inner">
          <BrandMark size={36} />
          <h2>Don&apos;t break the circle.</h2>
          <p>Sign in, grab testnet MON, and lock in with friends.</p>
          {ready && session ? (
            <Link href={appHref()} className="btn btn-primary btn-lg">
              Enter FocusBond
            </Link>
          ) : (
            <SignInButton session={session} onLogin={goApp} onLogout={logout} buttonLabel="Enter FocusBond" />
          )}
        </div>
      </section>

      <footer className="land-foot">
        <BrandMark size={24} />
        <span>Built at Monad Blitz London</span>
      </footer>
    </div>
  );
}
