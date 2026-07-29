import { getFeedProducts } from "@/lib/commerce";
import { buildProductFeedXml } from "@/lib/feed";

export const revalidate = 3600;

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://muse-and-silk-store.mohsin-aujla.chatgpt.site";

/** Google Merchant Center product feed (RSS 2.0 + `g:` Google Shopping namespace). Register this
 * URL as a scheduled fetch in Merchant Center: /api/feeds/google */
export async function GET() {
  const feedProducts = await getFeedProducts();
  const xml = buildProductFeedXml(feedProducts, SITE_ORIGIN, "Muse & Silk — Product Feed", "Muse & Silk scarves, bandanas and eyewear, for Google Merchant Center.");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
