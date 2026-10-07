import { insidePakistan, parseReverse } from "@/lib/geo";
import { trackedFetch } from "@/lib/usage";

export const dynamic = "force-dynamic";

/**
 * "Use my current location" and the draggable map pin: coordinates in, a ready-to-use address out. Coordinates are rounded to about
 * 10 metres, which makes nearby requests the same request, so Cloudflare answers repeats from its cache and the free allowance lasts.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Math.round(Number(params.get("lat")) * 10_000) / 10_000;
  const lon = Math.round(Number(params.get("lon")) * 10_000) / 10_000;
  if (!insidePakistan(lat, lon)) return Response.json({ error: "That place is outside Pakistan.", outside: true }, { status: 400, headers: { "Cache-Control": "public, max-age=600" } });

  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) return Response.json({ unavailable: true }, { headers: { "Cache-Control": "no-store" } });
  const url = new URL("https://api.geoapify.com/v1/geocode/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", key);
  try {
    const response = await trackedFetch("geoapify", url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return Response.json({ unavailable: true }, { headers: { "Cache-Control": "no-store" } });
    const result = parseReverse(await response.json(), lat, lon);
    return Response.json({ result }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch {
    return Response.json({ unavailable: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
