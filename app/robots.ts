import { siteOrigin } from "@/lib/brand";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  const open = ["/", "/cdn/", "/api/media/", "/api/campaign-media/", "/api/feeds/"];
  const closed = ["/admin", "/admin/", "/cart", "/checkout", "/wishlist", "/api", "/api/", "/preview", "/preview/"];
  return {
    rules: [
      // AI assistants and answer engines are welcome on the public pages (so they can describe and recommend the shop) – never on private ones.
      { userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended"], allow: open, disallow: closed },
      {
        userAgent: "*",
        allow: ["/", "/cdn/", "/api/media/", "/api/campaign-media/", "/api/feeds/"],
        // /api/media/[id] and /api/campaign-media/[id] serve every product and campaign photo on
        // the site — blocking all of /api/ (meant for admin/order/checkout endpoints, which have
        // no content worth crawling anyway) also blocked those image routes, which is exactly what
        // Google Merchant Center flags as "unable to crawl landing page/image" and disapproves the
        // product for. The Allow rules above are more specific and take precedence over Disallow.
        disallow: ["/admin", "/admin/", "/cart", "/checkout", "/wishlist", "/api", "/api/", "/preview", "/preview/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
