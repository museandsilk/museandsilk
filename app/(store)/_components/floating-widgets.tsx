"use client";

import { useEffect, useState, type ReactNode } from "react";

export const HIDE_KEYS = { currency: "na-hide-currency", whatsapp: "na-hide-whatsapp" } as const;
/** A hidden button comes back by itself after a week, so a shopper who closed it by accident is not locked out for good. */
const HIDE_FOR_MS = 7 * 24 * 60 * 60 * 1000;

export function isHidden(key: string, now = Date.now()): boolean {
  try {
    const until = Number(window.localStorage.getItem(key) ?? 0);
    return until > now;
  } catch {
    return false;
  }
}

export function hideFor(key: string, now = Date.now()) {
  try {
    window.localStorage.setItem(key, String(now + HIDE_FOR_MS));
  } catch {
    // private mode: it simply stays visible next time
  }
  window.dispatchEvent(new Event("na-widgets"));
}

export function showAll() {
  try {
    for (const key of Object.values(HIDE_KEYS)) window.localStorage.removeItem(key);
  } catch {
    // nothing to clear
  }
  window.dispatchEvent(new Event("na-widgets"));
}

/** Whether a floating button is hidden. Starts "hidden" on the server and on first paint (so nothing flashes), then reads the saved choice. */
export function useWidgetHidden(key: string): [boolean, boolean] {
  const [state, setState] = useState({ ready: false, hidden: true });
  useEffect(() => {
    const read = () => setState({ ready: true, hidden: isHidden(key) });
    read();
    window.addEventListener("na-widgets", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("na-widgets", read);
      window.removeEventListener("storage", read);
    };
  }, [key]);
  return [state.hidden, state.ready];
}

/** The round WhatsApp button, with a small ✕ to get it out of the way. */
export function WhatsAppFloat({ href, external, children }: { href: string; external: boolean; children: ReactNode }) {
  const [hidden] = useWidgetHidden(HIDE_KEYS.whatsapp);
  if (hidden) return null;
  return (
    <div className="float-whatsapp-wrap">
      <a className="float-whatsapp" href={href} target={external ? "_blank" : undefined} rel="noreferrer" aria-label="Chat with us on WhatsApp">
        {children}
      </a>
      <button type="button" className="float-close" aria-label="Hide the WhatsApp button" title="Hide" onClick={() => hideFor(HIDE_KEYS.whatsapp)}>
        ✕
      </button>
    </div>
  );
}

/** Footer link that brings the hidden buttons back. Shows only when something is hidden. */
export function ShowWidgetsLink() {
  const [wa, waReady] = useWidgetHidden(HIDE_KEYS.whatsapp);
  const [cur, curReady] = useWidgetHidden(HIDE_KEYS.currency);
  if (!(waReady && curReady) || !(wa || cur)) return null;
  return (
    <button type="button" className="footer-restore" onClick={showAll}>
      Show the chat and currency buttons
    </button>
  );
}
