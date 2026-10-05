import { publicBucketOrigin } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ONE_YEAR = 31536000;

/**
 * Same-origin CDN path for the public Neon bucket (see lib/media-url.ts). Cloudflare is told to
 * cache the origin response at the edge for a year (`cf.cacheEverything`), so after the first hit
 * in a region the bytes come straight from Cloudflare's cache — Neon storage is only ever the
 * origin. Keys are random UUIDs that are never overwritten, which is what makes "immutable" safe.
 *
 * For maximum speed, point NEXT_PUBLIC_CDN_URL at a Cloudflare-proxied hostname (e.g.
 * cdn.<domain>) whose origin rule targets the bucket — that skips the Worker entirely.
 */
export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  const objectKey = key.map(encodeURIComponent).join("/");

  // Only the media prefixes are public; never expose anything else that might live in the bucket.
  if (!/^(products|categories|campaign)\//.test(key.join("/"))) {
    return new Response("Not found", { status: 404 });
  }

  const origin = await fetch(`${publicBucketOrigin()}/${objectKey}`, {
    // `cf` is a Cloudflare Workers extension to RequestInit.
    cf: { cacheEverything: true, cacheTtl: ONE_YEAR, cacheTtlByStatus: { "200-299": ONE_YEAR, "404": 60, "500-599": 0 } },
  } as RequestInit);

  if (!origin.ok || !origin.body) return new Response("Not found", { status: origin.status === 404 ? 404 : 502 });

  const headers = new Headers();
  headers.set("Content-Type", origin.headers.get("content-type") ?? "application/octet-stream");
  const length = origin.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  const etag = origin.headers.get("etag");
  if (etag) headers.set("ETag", etag);
  headers.set("Cache-Control", `public, max-age=${ONE_YEAR}, immutable`);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(origin.body, { status: 200, headers });
}
