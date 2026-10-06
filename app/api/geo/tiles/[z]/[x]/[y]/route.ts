import { validTile } from "@/lib/geo";
import { trackedFetch } from "@/lib/usage";

export const dynamic = "force-dynamic";

/**
 * Map pictures for the checkout's "pick on the map". The browser asks us (never Geoapify directly), so the key stays secret, and every
 * tile is cached at Cloudflare for a month – the same tile is paid for once, however many shoppers look at it.
 */
export async function GET(_request: Request, context: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await context.params;
  const [zi, xi, yi] = [Number(z), Number(x), Number(y.replace(/\.png$/, ""))];
  if (!validTile(zi, xi, yi)) return new Response("Not found", { status: 404 });
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) return new Response("Map not available", { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const upstream = await trackedFetch("geoapify", `https://maps.geoapify.com/v1/tile/osm-bright/${zi}/${xi}/${yi}.png?apiKey=${key}`, { signal: AbortSignal.timeout(5000) });
    if (!upstream.ok || !upstream.body) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    return new Response(upstream.body, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800, s-maxage=2592000, immutable" } });
  } catch {
    return new Response("Map temporarily unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
