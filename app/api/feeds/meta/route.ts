import { siteOrigin } from "@/lib/brand";
import { getFeedProducts } from "@/lib/commerce";
import { buildProductFeedXml } from "@/lib/feed";

export const revalidate = 3600;

const SITE_ORIGIN = siteOrigin();

/** Meta (Facebook/Instagram) Commerce Manager product catalogue feed. Meta's Catalog ingestion
 * accepts the same Google Shopping RSS format (including the `g:` namespace), so this reuses the
 * shared feed builder in lib/feed.ts. Register this URL as a scheduled data feed in Commerce
 * Manager: /api/feeds/meta */
export async function GET() {
  const feedProducts = await getFeedProducts();
  const xml = buildProductFeedXml(feedProducts, SITE_ORIGIN, "Nure Asmir — Meta Catalogue Feed", "Nure Asmir men's wear, for Meta Commerce Manager.");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
