import { algoliasearch } from "algoliasearch";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, productImages, products, productVariants } from "@/db/schema";
import { mediaUrl } from "@/lib/media-url";

/**
 * Server-side Algolia indexing. The storefront's search box queries the index directly with a
 * search-only key (NEXT_PUBLIC_ALGOLIA_SEARCH_KEY); everything here uses the write key, which only
 * ever exists in server env (ALGOLIA_ADMIN_KEY). Indexing is best-effort: a search-index hiccup must
 * never fail a product save, so the sync helpers swallow and log errors.
 */
export type SearchRecord = {
  objectID: string;
  name: string;
  slug: string;
  category: string;
  categorySlug: string;
  type: string;
  color: string;
  sizes: string[];
  price: number;
  inStock: boolean;
  badge: string;
  description: string;
  imageUrl: string | null;
  blurDataUrl: string | null;
  featured: boolean;
  publishedAt: number;
};

export function indexName(): string {
  return process.env.ALGOLIA_INDEX_NAME || "nure_asmir_products";
}

function adminClient() {
  const appId = process.env.ALGOLIA_APP_ID || process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const key = process.env.ALGOLIA_ADMIN_KEY;
  if (!appId || !key) return null;
  return algoliasearch(appId, key);
}

async function buildRecords(productId?: string): Promise<SearchRecord[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      type: products.typeLabel,
      badge: products.badge,
      description: products.shortDescription,
      featured: products.featured,
      publishedAt: products.publishedAt,
      createdAt: products.createdAt,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(productId ? and(eq(products.id, productId), eq(products.status, "published")) : eq(products.status, "published"));
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const [variantRows, imageRows] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(and(inArray(productVariants.productId, ids), eq(productVariants.status, "active")))
      .orderBy(asc(productVariants.createdAt)),
    db
      .select({
        productId: productImages.productId,
        key: productImages.r2Key,
        widths: productImages.variantWidths,
        blur: productImages.blurDataUrl,
        isPrimary: productImages.isPrimary,
        sortOrder: productImages.sortOrder,
      })
      .from(productImages)
      .where(and(inArray(productImages.productId, ids), eq(productImages.status, "active")))
      .orderBy(asc(productImages.sortOrder)),
  ]);

  return rows.map((row) => {
    const variants = variantRows.filter((v) => v.productId === row.id);
    const primary = imageRows.filter((i) => i.productId === row.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
    const lead = variants.find((v) => v.isDefault) ?? variants[0];
    return {
      objectID: row.id,
      name: row.name,
      slug: row.slug,
      category: row.categoryName,
      categorySlug: row.categorySlug,
      type: row.type,
      color: lead?.color ?? "",
      sizes: [...new Set(variants.map((v) => v.size).filter((s): s is string => !!s))],
      price: lead?.price ?? 0,
      inStock: variants.some((v) => v.stockQuantity - v.reservedQuantity > 0),
      badge: row.badge ?? "",
      description: row.description ?? "",
      imageUrl: primary ? mediaUrl(primary.key, primary.widths) : null,
      blurDataUrl: primary?.blur ?? null,
      featured: row.featured,
      publishedAt: (row.publishedAt ?? row.createdAt).getTime(),
    };
  });
}

export async function configureIndex(): Promise<void> {
  const client = adminClient();
  if (!client) return;
  await client.setSettings({
    indexName: indexName(),
    indexSettings: {
      searchableAttributes: ["name", "unordered(type)", "unordered(category)", "unordered(color)", "unordered(description)"],
      attributesForFaceting: ["searchable(category)", "filterOnly(categorySlug)", "color", "sizes", "inStock"],
      customRanking: ["desc(featured)", "desc(publishedAt)"],
      attributesToHighlight: ["name"],
      attributesToSnippet: [],
      typoTolerance: true,
      minWordSizefor1Typo: 3,
      minWordSizefor2Typos: 6,
      removeStopWords: false,
      ignorePlurals: true,
      // Kameez / kurta / shalwar are spelled many ways in Pakistan — make the common ones equivalent.
    },
  });
  await client.saveSynonyms({
    indexName: indexName(),
    replaceExistingSynonyms: true,
    synonymHit: [
      { objectID: "kameez-shalwar", type: "synonym", synonyms: ["shalwar kameez", "shalwar qameez", "salwar kameez", "kameez shalwar", "kameez", "qameez"] },
      { objectID: "kurta", type: "synonym", synonyms: ["kurta", "kurtah", "kameez"] },
      { objectID: "waistcoat", type: "synonym", synonyms: ["waistcoat", "waist coat", "vest", "gilet"] },
      { objectID: "tee", type: "synonym", synonyms: ["tee", "t-shirt", "tshirt", "t shirt"] },
      { objectID: "pants", type: "synonym", synonyms: ["pants", "trousers", "pant", "cargo"] },
      { objectID: "wallet", type: "synonym", synonyms: ["wallet", "bifold", "card holder", "cardholder", "purse"] },
    ],
  });
}

/** Rebuilds the whole index from the database (settings + synonyms included). */
export async function reindexAll(): Promise<{ indexed: number }> {
  const client = adminClient();
  if (!client) throw new Error("ALGOLIA_APP_ID / ALGOLIA_ADMIN_KEY are not set");
  const records = await buildRecords();
  await configureIndex();
  await client.replaceAllObjects({ indexName: indexName(), objects: records as unknown as Record<string, unknown>[] });
  return { indexed: records.length };
}

/** Re-indexes (or removes, if no longer published) one product. Never throws. */
export async function syncProductSearch(productId: string): Promise<void> {
  try {
    const client = adminClient();
    if (!client) return;
    const [record] = await buildRecords(productId);
    if (record) await client.saveObject({ indexName: indexName(), body: record as unknown as Record<string, unknown> });
    else await client.deleteObject({ indexName: indexName(), objectID: productId });
  } catch (error) {
    console.error("Algolia sync failed for product", productId, error);
  }
}

export async function removeProductFromSearch(productId: string): Promise<void> {
  try {
    const client = adminClient();
    if (!client) return;
    await client.deleteObject({ indexName: indexName(), objectID: productId });
  } catch (error) {
    console.error("Algolia delete failed for product", productId, error);
  }
}
