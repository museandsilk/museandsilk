import { inArray } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { db } from "@/db";
import { adminPushDevices } from "@/db/schema";
import { pushConfigured, sendPush, type PushPayload } from "./fcm";

async function deliver(payload: PushPayload): Promise<void> {
  if (!pushConfigured()) return;
  const devices = await db.select({ token: adminPushDevices.token }).from(adminPushDevices);
  if (!devices.length) return;
  const results = await Promise.all(devices.map(async (device) => ({ token: device.token, result: await sendPush(device.token, payload) })));
  const dead = results.filter((entry) => entry.result === "dead").map((entry) => entry.token);
  if (dead.length) await db.delete(adminPushDevices).where(inArray(adminPushDevices.token, dead));
}

/**
 * Pushes an alert to every registered admin device without delaying the request that triggered it:
 * on Cloudflare it runs under `ctx.waitUntil`, elsewhere (local dev) it just runs in the background.
 * Never throws.
 */
export function notifyAdmins(payload: PushPayload): void {
  const job = deliver(payload).catch((error) => console.error("notifyAdmins failed", error));
  getCloudflareContext({ async: true })
    .then(({ ctx }) => ctx.waitUntil(job))
    .catch(() => {
      // No Workers context — the promise above is already running.
    });
}
