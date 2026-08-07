import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// Without this, OpenNext's default incremental cache is "dummy" — a no-op that never actually
// stores anything. Every page marked `revalidate = N` (shop, home, contact, faq, journal,
// policies…) was silently re-rendering from scratch, hitting the database, on every single
// request — never once served from cache — regardless of the revalidate window configured on the
// page itself. This points the cache at the same R2 bucket already used for product/campaign/
// category images (see lib/r2.ts), under its own "incremental-cache" prefix, via the
// NEXT_INC_CACHE_R2_BUCKET binding in wrangler.jsonc.
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
