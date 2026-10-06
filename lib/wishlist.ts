"use client";

import { useSyncExternalStore } from "react";

/**
 * Wishlist ("saved pieces"), kept in the visitor's browser — shoppers have no account. Stores product
 * ids only; the wishlist page re-reads current prices / stock from the catalogue. Components
 * subscribe through `useWishlist` (useSyncExternalStore), so every heart button, the header count and
 * other tabs stay in sync.
 */
const KEY = "nure-asmir-wishlist";
const EVENT = "na-wishlist-change";
const EMPTY: string[] = [];

let snapshot: string[] = EMPTY;
let loaded = false;

function read(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, 100) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function refresh() {
  const next = read();
  if (next.length !== snapshot.length || next.some((id, i) => id !== snapshot[i])) snapshot = next.length ? next : EMPTY;
}

function subscribe(listener: () => void) {
  if (!loaded) {
    loaded = true;
    refresh();
  }
  const onChange = () => {
    refresh();
    listener();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useWishlist(): string[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

export function toggleWishlist(productId: string): boolean {
  const current = read();
  const has = current.includes(productId);
  const next = has ? current.filter((id) => id !== productId) : [productId, ...current].slice(0, 100);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked (private mode) — nothing to persist
  }
  window.dispatchEvent(new CustomEvent(EVENT));
  // Keep sale alerts accurate for devices that opted in (dynamic import keeps firebase out of the main bundle).
  void import("./customer-push").then((module) => module.syncWishlistPush(next));
  return !has;
}
