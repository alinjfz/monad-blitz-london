"use client";

import { useEffect, useState } from "react";

const FALLBACK = 0.022;

export function useMonPrice() {
  const [usdPerMon, setUsdPerMon] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd",
        );
        if (!res.ok) throw new Error("price fetch failed");
        const data = await res.json();
        const price = data?.monad?.usd;
        if (!cancelled && typeof price === "number" && price > 0) setUsdPerMon(price);
      } catch {
        // keep fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { usdPerMon, loading, monPerUsd: 1 / usdPerMon };
}

type Props = {
  mon: string;
  onMonChange: (v: string) => void;
};

export function StakeConverter({ mon, onMonChange }: Props) {
  const { usdPerMon, loading } = useMonPrice();
  const monNum = Number(mon) || 0;
  const usd = monNum * usdPerMon;

  const setFromUsd = (usdStr: string) => {
    const n = Number(usdStr);
    if (!Number.isFinite(n) || n < 0) return;
    onMonChange((n / usdPerMon).toFixed(4).replace(/\.?0+$/, "") || "0");
  };

  return (
    <div className="stake-convert">
      <div className="stake-field">
        <label>Stake (USD)</label>
        <div className="stake-input">
          <span>$</span>
          <input
            type="text"
            inputMode="decimal"
            value={usd ? usd.toFixed(2) : ""}
            onChange={(e) => setFromUsd(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
          />
        </div>
      </div>
      <div className="stake-swap" aria-hidden>
        ⇄
      </div>
      <div className="stake-field">
        <label>Stake (MON)</label>
        <div className="stake-input">
          <input
            type="text"
            inputMode="decimal"
            value={mon}
            onChange={(e) => onMonChange(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.0"
          />
          <span>MON</span>
        </div>
      </div>
      <p className="stake-rate">
        {loading ? "Fetching rate…" : `1 MON ≈ $${usdPerMon.toFixed(4)}`}
      </p>
    </div>
  );
}
