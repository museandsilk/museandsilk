"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Double-click / double-tap protection for async button handlers.
 *
 * `run(fn)` executes `fn` only if no previous run is still in flight. The lock is a ref — set
 * synchronously, before React re-renders — so two clicks fired within the same frame (or a fast
 * double-tap on a phone) cannot both get through the way a `disabled={pending}` state flag alone
 * would allow. `pending` drives the spinner / disabled styling.
 */
export function useLockedAction() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setPending(true);
    try {
      return await fn();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }, []);

  return { run, pending };
}
