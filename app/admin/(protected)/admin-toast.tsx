"use client";

import { useEffect, type ReactNode } from "react";

const BAD = /couldn.?t|could not|can.?t|cannot|fail|error|invalid|wrong|not found|unauthor|denied|missing|already|must |please |no longer|unable|problem|doesn.?t/i;

/** A small popup in the corner instead of a quiet banner in the page. Good news disappears by itself
 * after a few seconds; problems stay a little longer. Always dismissable. */
export function AdminToast({ message, onClose, tone }: { message: ReactNode; onClose: () => void; tone?: "ok" | "warn" | "error" }) {
  const text = typeof message === "string" ? message : "";
  const resolved = tone ?? (BAD.test(text) ? "error" : "ok");

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, resolved === "error" ? 9000 : 5000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message) return null;
  return (
    <div className="admin-toast-stack">
      <div className={`notice-toast${resolved === "ok" ? " is-ok" : resolved === "warn" ? " is-warn" : ""}`} role={resolved === "error" ? "alert" : "status"} aria-live="polite">
        <span>{message}</span>
        <button type="button" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
