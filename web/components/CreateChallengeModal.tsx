"use client";

import { useEffect, useId, useState } from "react";
import { PRESETS, type Preset } from "@/lib/presets";
import { StakeConverter } from "@/components/StakeConverter";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (args: {
    preset: Preset;
    stakeMon: string;
    customGoal: string;
  }) => void;
  busy: boolean;
};

export function CreateChallengeModal({ open, onClose, onCreate, busy }: Props) {
  const titleId = useId();
  const [presetIdx, setPresetIdx] = useState(0);
  const [stakeMon, setStakeMon] = useState<string>(PRESETS[0].stakeMon);
  const [customGoal, setCustomGoal] = useState("");

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
              className={`preset-tile ${i === presetIdx ? "active" : ""}`}
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

        <label className="field-label">Custom goal (optional)</label>
        <input
          className="field-input"
          value={customGoal}
          onChange={(e) => setCustomGoal(e.target.value)}
          placeholder={preset.goal}
        />

        <StakeConverter mon={stakeMon} onMonChange={setStakeMon} />

        <div className="modal-meta">
          <span>Round {preset.round}s</span>
          <span>Dispute window {preset.challenge}s</span>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-lg modal-submit"
          disabled={busy || !stakeMon || Number(stakeMon) <= 0}
          onClick={() => onCreate({ preset, stakeMon, customGoal })}
        >
          {busy ? "Creating…" : "Create & stake"}
        </button>
      </div>
    </div>
  );
}
