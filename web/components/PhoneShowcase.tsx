"use client";

import { useEffect, useState } from "react";

/** Phone frame with an animated demo of a live challenge — Forfeit-style showcase. */
export function PhoneShowcase() {
  const [seconds, setSeconds] = useState(47);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds((s) => (s <= 1 ? 59 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % 4), 3200);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="phone-stage">
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-screen">
          <div className="phone-status">
            <span>9:41</span>
            <span className="phone-dots">●●●</span>
          </div>

          <div className={`phone-slide ${step === 0 ? "on" : ""}`}>
            <p className="phone-kicker">Live challenge</p>
            <h3>Blitz Lock-In</h3>
            <div className="phone-clock">
              {mm}:{ss}
            </div>
            <p className="phone-sub">3 friends · 0.3 MON each</p>
            <div className="phone-pills">
              <span className="ok">Alice ✓</span>
              <span className="ok">Bob ✓</span>
              <span className="wait">You…</span>
            </div>
          </div>

          <div className={`phone-slide ${step === 1 ? "on" : ""}`}>
            <p className="phone-kicker">Check in</p>
            <h3>Upload proof</h3>
            <div className="phone-drop">
              <div className="phone-cam" />
              <p>Hash in browser · never stored</p>
            </div>
            <button type="button" className="phone-cta" tabIndex={-1}>
              Submit proof
            </button>
          </div>

          <div className={`phone-slide ${step === 2 ? "on" : ""}`}>
            <p className="phone-kicker">Missed</p>
            <h3>Cara broke focus</h3>
            <div className="phone-slash">
              <strong>−0.30 MON</strong>
              <span>split to Alice &amp; Bob</span>
            </div>
            <p className="phone-sub">Contract kept nothing</p>
          </div>

          <div className={`phone-slide ${step === 3 ? "on" : ""}`}>
            <p className="phone-kicker">Friends</p>
            <h3>Invite circle</h3>
            <div className="phone-friends">
              <div>
                <b>A</b> Alice
              </div>
              <div>
                <b>B</b> Bob
              </div>
              <div className="invite">+</div>
            </div>
            <p className="phone-sub">Share a link · they stake · you start</p>
          </div>

          <div className="phone-home" />
        </div>
      </div>
      <div className="phone-glow" />
    </div>
  );
}
