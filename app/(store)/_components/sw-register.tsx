"use client";

import { useEffect } from "react";
import { SW_URL } from "@/lib/sw-url";

/** Registers the storefront service worker (browser cache + push) once the page has settled.
 * Production only: in `next dev` a caching worker just gets in the way. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register(SW_URL).catch((error) => console.warn("Service worker registration failed", error));
    if (document.readyState === "complete") {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
      if (idle) idle(register);
      else window.setTimeout(register, 1500);
    } else {
      window.addEventListener("load", () => window.setTimeout(register, 500), { once: true });
    }
  }, []);
  return null;
}
