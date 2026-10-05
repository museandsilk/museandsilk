/**
 * Firebase Cloud Messaging (HTTP v1) sender for Cloudflare Workers.
 *
 * Auth is a Google service account (env FIREBASE_SERVICE_ACCOUNT = the JSON key, as one line): we
 * sign a short-lived JWT with WebCrypto (RS256), exchange it for an OAuth access token and cache it
 * until shortly before it expires. No firebase-admin SDK (far too heavy for a Worker).
 */
type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let cached: { token: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    return parsed.client_email && parsed.private_key && parsed.project_id ? parsed : null;
  } catch {
    return null;
  }
}

export function pushConfigured(): boolean {
  return loadServiceAccount() !== null;
}

function base64Url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJwt(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = account.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${base64Url(signature)}`;
}

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: await signJwt(account) }),
  });
  if (!response.ok) throw new Error(`Google OAuth responded ${response.status}`);
  const json = (await response.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

export type PushPayload = { title: string; body: string; url?: string };

/** Sends one notification. Returns "ok", "dead" (token no longer valid — delete it) or "error". */
export async function sendPush(deviceToken: string, payload: PushPayload): Promise<"ok" | "dead" | "error"> {
  const account = loadServiceAccount();
  if (!account) return "error";
  try {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken(account)}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          // Data-only: the service worker (public/firebase-messaging-sw.js) builds the notification.
          data: { title: payload.title, body: payload.body, url: payload.url ?? "/admin/orders" },
          webpush: { headers: { Urgency: "high", TTL: "86400" } },
        },
      }),
    });
    if (response.ok) return "ok";
    if (response.status === 404 || response.status === 400) {
      const text = await response.text();
      if (/UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(text)) return "dead";
    }
    console.error("FCM send failed", response.status);
    return "error";
  } catch (error) {
    console.error("FCM send threw", error);
    return "error";
  }
}
