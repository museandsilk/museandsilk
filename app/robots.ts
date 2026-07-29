import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://muse-and-silk-store.mohsin-aujla.chatgpt.site";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/cart", "/checkout", "/api", "/api/", "/preview", "/preview/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
