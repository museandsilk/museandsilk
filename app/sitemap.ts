import type { MetadataRoute } from "next";
import { getActiveCollections, getCatalogProducts } from "@/lib/commerce";
import { journalArticles } from "./(store)/journal/journal-data";

const POLICY_SLUGS = ["shipping", "returns", "privacy", "terms"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://muse-and-silk-store.mohsin-aujla.chatgpt.site";
  const [products, collections] = await Promise.all([getCatalogProducts(), getActiveCollections()]);
  const now = new Date();

  return [
    { url: origin, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${origin}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${origin}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${origin}/journal`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    ...["scarves", "bandanas", "glasses"].map((slug) => ({
      url: `${origin}/collections/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...collections.map((collection) => ({
      url: `${origin}/collections/${collection.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...products.map((product) => ({
      url: `${origin}/products/${product.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...journalArticles.map((article) => ({
      url: `${origin}/journal/${article.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
    ...POLICY_SLUGS.map((slug) => ({
      url: `${origin}/policies/${slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
