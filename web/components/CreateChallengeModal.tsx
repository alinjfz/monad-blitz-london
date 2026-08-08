"use client";

import { useEffect, useId, useState } from "react";
import {
  DEFAULT_CHALLENGE_SECONDS,
  DEFAULT_ROUND_SECONDS,
  PRESETS,
  type Preset,
} from "@/lib/presets";
import { StakeConverter } from "@/components/StakeConverter";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (args: {
    preset: Preset;
    stakeMon: string;
    customGoal: string;
    roundSeconds: number;
    challengeSeconds: number;
  }) => void;
  busy: boolean;
};

function TimerControl({
  label,
  value,
  onChange,
  step = 10,
  min = 5,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <div className="timer-control">
      <span className="timer-label">{label}</span>
      <div className="timer-stepper">
        <button
          type="button"
          className="btn btn-ghost btn-sm timer-btn"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          −
        </button>
        <input
          className="timer-input"
          type="number"
          min={min}
          step={1}
          value={value}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
          aria-label={`${label} seconds`}
        />
        <span className="timer-unit">s</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm timer-btn"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value + step)}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function CreateChallengeModal({ open, onClose, onCreate, busy }: Props) {
  const titleId = useId();
  const [presetIdx, setPresetIdx] = useState(0);
  const [stakeMon, setStakeMon] = useState<string>(PRESETS[0].stakeMon);
  const [customGoal, setCustomGoal] = useState("");
  const [roundSeconds, setRoundSeconds] = useState(DEFAULT_ROUND_SECONDS);
  const [challengeSeconds, setChallengeSeconds] = useState(DEFAULT_CHALLENGE_SECONDS);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const preset = PRESETS[presetIdx];
  const isCustom = preset.id === "custom";
  const canCreate =
    !!stakeMon &&
    Number(stakeMon) > 0 &&
    roundSeconds > 0 &&
    challengeSeconds > 0 &&
    (!isCustom || customGoal.trim().length > 0);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id={titleId}>Create a challenge</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="modal-lede">Pick a goal, set the stake, invite friends. They open the link in another browser, connect, and accept.</p>

        <div className="preset-grid">
          {PRESETS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`preset-tile ${i === presetIdx ? "active" : ""} ${p.id === "custom" ? "preset-custom" : ""}`}
              onClick={() => {
                setPresetIdx(i);
                setStakeMon(p.stakeMon);
              }}
            >
              <strong>{p.label}</strong>
              <span>{p.goal}</span>
              <em>{p.proof}</em>
            </button>
          ))}
        </div>

        <label className="field-label" htmlFor="custom-goal">
          {isCustom ? "Your goal" : "Custom goal (optional)"}
        </label>
        <input
          id="custom-goal"
          className="field-input"
          value={customGoal}
          onChange={(e) => setCustomGoal(e.target.value)}
          placeholder={isCustom ? "e.g. Ship the landing page tonight" : preset.goal}
        />

        <p className="field-label">Timer</p>
        <div className="timer-fields">
          <TimerControl label="Round" value={roundSeconds} onChange={setRoundSeconds} step={10} min={5} />
          <TimerControl
            label="Dispute window"
            value={challengeSeconds}
            onChange={setChallengeSeconds}
            step={5}
            min={5}
          />
        </div>

        <StakeConverter mon={stakeMon} onMonChange={setStakeMon} />

        <button
          type="button"
          className="btn btn-primary btn-lg modal-submit"
          disabled={busy || !canCreate}
          onClick={() =>
            onCreate({
              preset,
              stakeMon,
              customGoal,
              roundSeconds,
              challengeSeconds,
            })
          }
        >
          {busy ? "Creating…" : "Create & stake"}
        </button>
      </div>
    </div>
  );
}
