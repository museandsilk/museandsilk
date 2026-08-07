import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Puts image responses into Cloudflare's actual edge cache (the same `caches.default` a Worker's
 * own fetch handler would use), not just the browser's cache. Without this, `Cache-Control:
 * max-age=31536000` on /api/media, /api/category-media and /api/campaign-media only ever helped a
 * single returning visitor's browser — every *other* visitor, on every view, re-ran the Worker and
 * re-fetched from R2, since Cloudflare doesn't automatically cache a Worker's dynamic responses at
 * the edge just because the Cache-Control header says it's cacheable. This makes the same origin
 * image served once get reused for every subsequent visitor hitting that edge location, worldwide,
 * until the 1-year TTL or a manual purge.
 *
 * Verified live: cache.put() confirmed to succeed and a second request for the same URL comes back
 * from the edge cache (no DB query, no R2 fetch) rather than re-running this route.
 *
 * Best-effort: local `next dev` has no real Workers execution context, so both functions simply
 * no-op there rather than throwing — matches how other optional integrations in this codebase
 * degrade when their environment isn't available.
 */

function defaultCache(): Cache | null {
  const store = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
  return store?.default ?? null;
}

export async function matchEdgeCache(request: Request): Promise<Response | null> {
  const cache = defaultCache();
  if (!cache) return null;
  try {
    return (await cache.match(request)) ?? null;
  } catch {
    return null;
  }
}

/** Fire-and-forget: writes to the edge cache in the background via the Worker's execution
 * context, so the response returns to the client without waiting on the cache write. */
export function putEdgeCache(request: Request, response: Response): void {
  const cache = defaultCache();
  if (!cache) return;
  getCloudflareContext({ async: true })
    .then(({ ctx }) => ctx.waitUntil(cache.put(request, response)))
    .catch(() => {
      // No Workers execution context (e.g. local dev) — nothing to wait on, skip.
    });
}
