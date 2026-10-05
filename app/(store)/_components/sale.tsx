"use client";

import { useEffect, useState } from "react";

/** "−20%" style label for a discounted product. */
export function discountLabel(price: number, compareAt?: number | null): string | null {
  if (!compareAt || compareAt <= price) return null;
  return `−${Math.round(((compareAt - price) / compareAt) * 100)}%`;
}

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { d, h, m, s, total };
}

/** Live countdown to the end of a flash sale; renders nothing once it has ended. */
export function SaleCountdown({ endsAt, label = "Sale ends in" }: { endsAt: string; label?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Start after mount so server and client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (now === null) return <p className="sale-countdown" aria-hidden="true">&nbsp;</p>;
  const { d, h, m, s, total } = parts(new Date(endsAt).getTime() - now);
  if (total <= 0) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <p className="sale-countdown" role="timer" aria-live="off">
      <strong>{label}</strong> {d > 0 ? `${d}d ` : ""}
      {pad(h)}:{pad(m)}:{pad(s)}
    </p>
  );
}
