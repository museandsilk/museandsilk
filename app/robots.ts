import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://museandsilk.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/media/", "/api/campaign-media/", "/api/feeds/"],
        // /api/media/[id] and /api/campaign-media/[id] serve every product and campaign photo on
        // the site — blocking all of /api/ (meant for admin/order/checkout endpoints, which have
        // no content worth crawling anyway) also blocked those image routes, which is exactly what
        // Google Merchant Center flags as "unable to crawl landing page/image" and disapproves the
        // product for. The Allow rules above are more specific and take precedence over Disallow.
        disallow: ["/admin", "/admin/", "/cart", "/checkout", "/api", "/api/", "/preview", "/preview/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
