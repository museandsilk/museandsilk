import { fetchRates } from "@/lib/currency";

/** Cached currency table for the storefront's currency switcher (see lib/currency.ts). Frankfurter
 * publishes daily, so an hour at Cloudflare's edge (plus a day of stale-while-revalidate) keeps the
 * public API essentially untouched however much traffic the storefront gets. */
export async function GET() {
  try {
    const payload = await fetchRates();
    return Response.json(payload, {
      headers: { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return Response.json({ error: "Exchange rates are unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
