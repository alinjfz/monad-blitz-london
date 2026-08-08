"use client";

import { useId, useState, type ReactNode } from "react";

type Props = {
  title: string;
  hint?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
};

export function CollapsiblePanel({ title, hint, defaultOpen = true, children, className = "" }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className={`panel collapsible-panel ${open ? "is-open" : "is-closed"} ${className}`.trim()}>
      <header className="panel-head">
        <button
          type="button"
          className="panel-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="panel-toggle-caret" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          <h2>{title}</h2>
        </button>
        <div className="panel-head-right">{hint}</div>
      </header>
      {open && (
        <div className="panel-body" id={panelId}>
          {children}
        </div>
      )}
    </section>
  );
}
