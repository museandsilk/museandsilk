import { siteOrigin } from "@/lib/brand";
import { getFeedProducts } from "@/lib/commerce";
import { buildProductFeedXml } from "@/lib/feed";

export const revalidate = 3600;

const SITE_ORIGIN = siteOrigin();

/** Google Merchant Center product feed (RSS 2.0 + `g:` Google Shopping namespace). Register this
 * URL as a scheduled fetch in Merchant Center: /api/feeds/google */
export async function GET() {
  const feedProducts = await getFeedProducts();
  const xml = buildProductFeedXml(feedProducts, SITE_ORIGIN, "Nure Asmir — Product Feed", "Nure Asmir men's wear, for Google Merchant Center.");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
