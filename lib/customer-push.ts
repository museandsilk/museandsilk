"use client";

import { firebaseConfig, firebaseVapidKey } from "@/lib/firebase/config";
import { SW_URL } from "@/lib/sw-url";

const TOKEN_KEY = "na-customer-push-token";

export type PushSupport = "unsupported" | "blocked" | "available";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  return Notification.permission === "denied" ? "blocked" : "available";
}

export function hasCustomerPushToken(): boolean {
  try {
    return !!window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return false;
  }
}

export type PushRegistration = { orderNumber?: string; phone?: string; wishlist?: string[]; salesOptIn?: boolean };

/** Asks permission (must be called from a click), gets an FCM token and registers it with the server. */
export async function registerCustomerPush(options: PushRegistration): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (pushSupport() === "unsupported") return { ok: false, error: "This browser doesn't support notifications." };
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, error: "Notifications are blocked — enable them in your browser settings." };

    const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    const registration = await navigator.serviceWorker.register(SW_URL);
    await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), {
      serviceWorkerRegistration: registration,
      ...(firebaseVapidKey ? { vapidKey: firebaseVapidKey } : {}),
    });
    if (!token) return { ok: false, error: "Couldn't enable notifications on this device." };

    const response = await fetch("/api/push/customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...options }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? "Couldn't enable notifications." };
    }
    window.localStorage.setItem(TOKEN_KEY, token);
    return { ok: true };
  } catch (error) {
    console.error("registerCustomerPush failed", error);
    return { ok: false, error: "Couldn't enable notifications on this device." };
  }
}

/** Keeps the server-side wishlist (for sale alerts) in step with the local one. No-op if not subscribed. */
export async function syncWishlistPush(wishlist: string[]): Promise<void> {
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await fetch("/api/push/customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, wishlist }),
      keepalive: true,
    });
  } catch {
    // best effort
  }
}

export async function unregisterCustomerPush(): Promise<boolean> {
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return true;
    const response = await fetch("/api/push/customer", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    if (!response.ok) return false;
    window.localStorage.removeItem(TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}
