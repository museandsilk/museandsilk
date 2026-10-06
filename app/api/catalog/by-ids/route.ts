import { getCatalogProducts, toCard } from "@/lib/commerce";

/** Current catalogue cards for a list of product ids (the wishlist page). Cacheable at the edge and
 * in the browser's service worker — prices/stock here are previews; checkout re-prices on the server. */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 50);
  if (!ids.length) return Response.json({ products: [] });

  const products = (await getCatalogProducts({ ids })).map(toCard);
  return Response.json({ products }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
}
