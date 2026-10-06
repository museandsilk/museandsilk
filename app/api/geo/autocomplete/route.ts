import { cleanQuery, MIN_QUERY, parseSuggestions } from "@/lib/geo";

export const dynamic = "force-dynamic";

/**
 * Address suggestions for the checkout form and the admin's shop locations. The browser only calls this after the
 * person stops typing (see components/address-search), the answer is cached at the edge for a day, and short or
 * junk input never reaches Geoapify – together this keeps the free quota safe.
 */
export async function GET(request: Request) {
  const query = cleanQuery(new URL(request.url).searchParams.get("text"));
  if (query.length < MIN_QUERY) return Response.json({ suggestions: [] }, { headers: { "Cache-Control": "public, max-age=3600" } });

  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) return Response.json({ suggestions: [], unavailable: true }, { status: 200, headers: { "Cache-Control": "no-store" } });

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", query);
  url.searchParams.set("filter", "countrycode:pk");
  url.searchParams.set("bias", "countrycode:pk");
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", key);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return Response.json({ suggestions: [], unavailable: true }, { headers: { "Cache-Control": "no-store" } });
    const suggestions = parseSuggestions(await response.json());
    return Response.json({ suggestions }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch {
    // Address search is a convenience – when it is down the shopper simply types the address.
    return Response.json({ suggestions: [], unavailable: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
