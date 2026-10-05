"use client";

import { writeCart, type CartItem } from "./cart";

type Availability = { variantId: string; available: number; price: number | null };

export type CartSyncResult = { items: CartItem[]; notice: string; changed: boolean };

/**
 * Reconciles a saved bag with the live catalogue (stock and price), the way a returning shopper
 * needs after hours or days away: sold-out lines are dropped, quantities are clamped to what is left
 * and prices follow the current price (flash sales included). The bag is rewritten when anything
 * changed. Returns `null` if the check itself failed — the caller keeps the bag as is; the server
 * re-validates at checkout regardless.
 */
export async function syncCartWithServer(items: CartItem[], signal?: AbortSignal): Promise<CartSyncResult | null> {
  if (!items.length) return { items, notice: "", changed: false };
  try {
    const response = await fetch("/api/cart-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantIds: items.map((item) => item.variantId) }),
      signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { availability?: Availability[] };
    if (!data.availability) return null;

    const live = new Map(data.availability.map((entry) => [entry.variantId, entry]));
    let changed = false;
    const removed: string[] = [];
    const reduced: string[] = [];
    const repriced: string[] = [];

    const next = items
      .map((item) => {
        const entry = live.get(item.variantId);
        if (!entry) return item;
        let price = item.price;
        if (typeof entry.price === "number" && entry.price !== item.price) {
          changed = true;
          repriced.push(`${item.name} (${entry.price < item.price ? "now cheaper" : "price updated"})`);
          price = entry.price;
        }
        if (entry.available !== item.available) changed = true;
        if (item.quantity > entry.available) {
          changed = true;
          (entry.available < 1 ? removed : reduced).push(item.name);
        }
        return { ...item, price, available: entry.available, quantity: Math.min(item.quantity, entry.available) };
      })
      .filter((item) => item.quantity > 0);

    if (changed) writeCart(next);
    const notice = [
      removed.length && `${removed.join(", ")} ${removed.length > 1 ? "are" : "is"} no longer available and ${removed.length > 1 ? "were" : "was"} removed from your bag.`,
      reduced.length && `Stock changed for ${reduced.join(", ")} — quantity adjusted.`,
      repriced.length && `Prices changed: ${repriced.join(", ")}.`,
    ]
      .filter(Boolean)
      .join(" ");
    return { items: next, notice, changed };
  } catch {
    return null;
  }
}

/**
 * Idempotency key for a checkout attempt, remembered per bag contents. If the shopper closes the tab
 * (or loses signal) after pressing "Place order", the order may already exist on the server; coming
 * back and pressing the button again re-uses the same key, so the server hands back that order
 * instead of creating a duplicate. Cleared once an order is confirmed.
 */
const ATTEMPT_KEY = "na-checkout-attempt";
const ATTEMPT_TTL_MS = 30 * 60 * 1000;

function signature(items: Pick<CartItem, "variantId" | "quantity">[]): string {
  return [...items]
    .sort((a, b) => a.variantId.localeCompare(b.variantId))
    .map((item) => `${item.variantId}:${item.quantity}`)
    .join("|");
}

export function checkoutAttemptKey(items: Pick<CartItem, "variantId" | "quantity">[]): string {
  const sig = signature(items);
  try {
    const saved = JSON.parse(window.localStorage.getItem(ATTEMPT_KEY) ?? "null") as { key: string; sig: string; at: number } | null;
    if (saved && saved.sig === sig && Date.now() - saved.at < ATTEMPT_TTL_MS) return saved.key;
    const key = crypto.randomUUID();
    window.localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ key, sig, at: Date.now() }));
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearCheckoutAttempt(): void {
  try {
    window.localStorage.removeItem(ATTEMPT_KEY);
  } catch {
    // ignore
  }
}
