import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Runs best-effort work (notifications, search sync, stock alerts) without delaying the response:
 * on Cloudflare the promise is handed to `ctx.waitUntil` so the Worker stays alive until it settles;
 * in local dev there is no Workers context and the promise simply keeps running. Errors are logged
 * and swallowed — background work must never fail the request that spawned it.
 */
export function runInBackground(job: Promise<unknown>, label = "background job"): void {
  const guarded = job.catch((error) => console.error(`${label} failed`, error));
  getCloudflareContext({ async: true })
    .then(({ ctx }) => ctx.waitUntil(guarded))
    .catch(() => {
      // No Workers execution context (e.g. `next dev`) — already running.
    });
}
