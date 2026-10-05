"use client";

import { useEffect, useState } from "react";
import { firebaseConfig, firebaseVapidKey } from "@/lib/firebase/config";

const TOKEN_KEY = "na-admin-push-token";

type State = "unsupported" | "off" | "on" | "blocked" | "busy";

/** "Order alerts" switch in the admin sidebar: registers this browser with Firebase Cloud Messaging
 * and stores the device token so new orders / payment proofs can be pushed to it. */
export function PushToggle() {
  const [state, setState] = useState<State>("busy");
  const [note, setNote] = useState("");

  useEffect(() => {
    // Browser capability + saved token can only be read after mount.
    const supported = "Notification" in window && "serviceWorker" in navigator;
    if (!supported) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    const saved = window.localStorage.getItem(TOKEN_KEY);
    setState(saved && Notification.permission === "granted" ? "on" : "off");
  }, []);

  async function enable() {
    setState("busy");
    setNote("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      await navigator.serviceWorker.ready;
      const token = await getToken(getMessaging(app), {
        serviceWorkerRegistration: registration,
        ...(firebaseVapidKey ? { vapidKey: firebaseVapidKey } : {}),
      });
      if (!token) throw new Error("No device token was issued.");
      const response = await fetch("/api/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error("The server rejected the registration.");
      const result = (await response.json()) as { ready?: boolean };
      window.localStorage.setItem(TOKEN_KEY, token);
      setNote(result.ready ? "" : "Registered — alerts start once the server key is added.");
      setState("on");
    } catch (error) {
      console.error("Enabling order alerts failed", error);
      setNote("Could not enable alerts on this browser.");
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    const token = window.localStorage.getItem(TOKEN_KEY);
    try {
      if (token) {
        await fetch("/api/admin/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      }
    } finally {
      window.localStorage.removeItem(TOKEN_KEY);
      setState("off");
    }
  }

  if (state === "unsupported") return null;
  return (
    <div className="admin-push">
      <button type="button" disabled={state === "busy" || state === "blocked"} onClick={state === "on" ? disable : enable}>
        {state === "on" ? "Order alerts: on" : state === "blocked" ? "Alerts blocked in browser" : "Enable order alerts"}
      </button>
      {note && <small>{note}</small>}
    </div>
  );
}
