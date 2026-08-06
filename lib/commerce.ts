import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { campaignSlides, categories, collections, productCollections, productImages, products, productVariants, siteSettings } from "@/db/schema";

export type CatalogVariant = {
  id: string;
  name: string;
  sku: string;
  color: string;
  size?: string;
  fabric?: string;
  price: number;
  compareAtPrice?: number | null;
  stock: number;
  reserved: number;
  available: number;
  isDefault: boolean;
};

export type CatalogImage = {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
  blurDataUrl?: string;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  categoryId: string;
  type: string;
  price: number;
  compareAtPrice?: number | null;
  color: string;
  badge: string;
  sku: string;
  imageUrl?: string;
  stock: number;
  description?: string;
  shortDescription?: string;
  material?: string;
  dimensions?: string;
  careInstructions?: string;
  seoTitle?: string;
  seoDescription?: string;
  blurDataUrl?: string;
  variants: CatalogVariant[];
  images: CatalogImage[];
  /** One lead image per variant (in variant-creation order), for products with more than one
   * variant — lets a product card cycle through each color/style instead of showing only the
   * default variant's picture. Empty when variants have no images of their own yet. */
  variantImages: CatalogImage[];
};

function imageUrlFor(imageId: string) {
  return `/api/media/${imageId}`;
}

/** For each given product, the first active image belonging to each of its active variants
 * (ordered by that image's own sortOrder/createdAt), returned in variant-creation order. Used to
 * drive the color-cycling product card on storefront listings — kept separate from the single
 * product-level "primary" image query above so that query keeps its one-row-per-product guarantee
 * (multiple variants each having their own primary image would otherwise multiply join rows). */
async function getVariantLeadImages(productIds: string[]): Promise<Map<string, CatalogImage[]>> {
  if (!productIds.length) return new Map();

  const rows = await db
    .selectDistinctOn([productImages.variantId], {
      variantId: productImages.variantId,
      productId: productImages.productId,
      imageId: productImages.id,
      altText: productImages.altText,
      sortOrder: productImages.sortOrder,
      isPrimary: productImages.isPrimary,
      blurDataUrl: productImages.blurDataUrl,
      variantCreatedAt: productVariants.createdAt,
    })
    .from(productImages)
    .innerJoin(productVariants, eq(productVariants.id, productImages.variantId))
    .where(
      and(
        inArray(productImages.productId, productIds),
        eq(productImages.status, "active"),
        eq(productVariants.status, "active"),
      ),
    )
    .orderBy(productImages.variantId, asc(productImages.sortOrder), asc(productImages.createdAt));

  const byProduct = new Map<string, { image: CatalogImage; variantCreatedAt: Date }[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push({
      image: {
        id: row.imageId,
        url: imageUrlFor(row.imageId),
        altText: row.altText,
        sortOrder: row.sortOrder,
        isPrimary: row.isPrimary,
        blurDataUrl: row.blurDataUrl ?? undefined,
      },
      variantCreatedAt: row.variantCreatedAt,
    });
    byProduct.set(row.productId, list);
  }

  const result = new Map<string, CatalogImage[]>();
  for (const [productId, entries] of byProduct) {
    entries.sort((a, b) => a.variantCreatedAt.getTime() - b.variantCreatedAt.getTime());
    result.set(productId, entries.map((entry) => entry.image));
  }
  return result;
}

/** Published products for storefront listing (shop grid, homepage "New arrivals", etc). Each product
 * carries its default variant's price/stock/primary image — enough for a product card without a
 * second query per product. */
export async function getCatalogProducts(): Promise<CatalogProduct[]> {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      type: products.typeLabel,
      badge: products.badge,
      description: products.description,
      shortDescription: products.shortDescription,
      material: products.material,
      dimensions: products.dimensions,
      categoryId: products.categoryId,
      categorySlug: categories.slug,
      variantId: productVariants.id,
      variantName: productVariants.name,
      sku: productVariants.sku,
      color: productVariants.color,
      price: productVariants.price,
      compareAtPrice: productVariants.compareAtPrice,
      stock: productVariants.stockQuantity,
      reserved: productVariants.reservedQuantity,
      imageId: productImages.id,
      altText: productImages.altText,
      blurDataUrl: productImages.blurDataUrl,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.isDefault, true)))
    .leftJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.isPrimary, true), eq(productImages.status, "active")))
    .where(eq(products.status, "published"))
    .orderBy(desc(products.publishedAt), desc(products.createdAt));

  const variantImagesByProduct = await getVariantLeadImages(rows.map((row) => row.id));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.categorySlug,
    categoryId: row.categoryId,
    type: row.type,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    color: row.color,
    badge: row.badge ?? "",
    sku: row.sku,
    imageUrl: row.imageId ? imageUrlFor(row.imageId) : undefined,
    blurDataUrl: row.blurDataUrl ?? undefined,
    stock: Math.max(0, row.stock - row.reserved),
    description: row.description ?? "",
    shortDescription: row.shortDescription ?? "",
    material: row.material ?? "",
    dimensions: row.dimensions ?? "",
    variants: [],
    images: [],
    variantImages: variantImagesByProduct.get(row.id) ?? [],
  }));
}

export async function getProductBySlug(slug: string): Promise<CatalogProduct | null> {
  const [row] = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      type: products.typeLabel,
      badge: products.badge,
      description: products.description,
      shortDescription: products.shortDescription,
      material: products.material,
      dimensions: products.dimensions,
      careInstructions: products.careInstructions,
      seoTitle: products.seoTitle,
      seoDescription: products.seoDescription,
      categoryId: products.categoryId,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), eq(products.status, "published")))
    .limit(1);
  if (!row) return null;

  const [variantRows, imageRows] = await Promise.all([
    db
      .select({
        id: productVariants.id,
        name: productVariants.name,
        sku: productVariants.sku,
        color: productVariants.color,
        size: productVariants.size,
        fabric: productVariants.fabric,
        price: productVariants.price,
        compareAtPrice: productVariants.compareAtPrice,
        stock: productVariants.stockQuantity,
        reserved: productVariants.reservedQuantity,
        isDefault: productVariants.isDefault,
      })
      .from(productVariants)
      .where(and(eq(productVariants.productId, row.id), eq(productVariants.status, "active")))
      .orderBy(desc(productVariants.isDefault), asc(productVariants.createdAt)),
    db
      .select({
        id: productImages.id,
        altText: productImages.altText,
        sortOrder: productImages.sortOrder,
        isPrimary: productImages.isPrimary,
        blurDataUrl: productImages.blurDataUrl,
      })
      .from(productImages)
      .where(and(eq(productImages.productId, row.id), eq(productImages.status, "active")))
      .orderBy(desc(productImages.isPrimary), asc(productImages.sortOrder), asc(productImages.createdAt)),
  ]);
  const variantImagesByProduct = await getVariantLeadImages([row.id]);

  const variants: CatalogVariant[] = variantRows.map((v) => ({
    id: v.id,
    name: v.name,
    sku: v.sku,
    color: v.color,
    size: v.size ?? undefined,
    fabric: v.fabric ?? undefined,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    stock: v.stock,
    reserved: v.reserved,
    available: Math.max(0, v.stock - v.reserved),
    isDefault: v.isDefault,
  }));
  const images: CatalogImage[] = imageRows.map((img) => ({
    id: img.id,
    url: imageUrlFor(img.id),
    altText: img.altText,
    sortOrder: img.sortOrder,
    isPrimary: img.isPrimary,
    blurDataUrl: img.blurDataUrl ?? undefined,
  }));
  const defaultVariant = variants.find((v) => v.isDefault) ?? variants[0];

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.categorySlug,
    categoryId: row.categoryId,
    type: row.type,
    price: defaultVariant?.price ?? 0,
    compareAtPrice: defaultVariant?.compareAtPrice,
    color: defaultVariant?.color ?? "",
    badge: row.badge ?? "",
    sku: defaultVariant?.sku ?? "",
    imageUrl: images[0]?.url,
    blurDataUrl: images[0]?.blurDataUrl,
    stock: defaultVariant?.available ?? 0,
    description: row.description ?? "",
    shortDescription: row.shortDescription ?? "",
    material: row.material ?? "",
    dimensions: row.dimensions ?? "",
    careInstructions: row.careInstructions ?? "",
    seoTitle: row.seoTitle ?? undefined,
    seoDescription: row.seoDescription ?? undefined,
    variants,
    images,
    variantImages: variantImagesByProduct.get(row.id) ?? [],
  };
}

export type CampaignSlide = {
  id: string;
  imageUrl: string;
  mobileImageUrl: string | null;
  altText: string;
  eyebrow: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  sortOrder: number;
  blurDataUrl?: string;
};

/** Homepage hero slides — CampaignCarousel auto-rotates through these every 5s. Falls back to a
 * single hardcoded slide (in the component) when none exist yet in the DB. */
export async function getCampaignSlides(includeInactive = false): Promise<CampaignSlide[]> {
  const rows = await db
    .select({
      id: campaignSlides.id,
      altText: campaignSlides.altText,
      eyebrow: campaignSlides.eyebrow,
      headline: campaignSlides.headline,
      body: campaignSlides.body,
      ctaLabel: campaignSlides.ctaLabel,
      ctaHref: campaignSlides.ctaHref,
      sortOrder: campaignSlides.sortOrder,
      active: campaignSlides.active,
      blurDataUrl: campaignSlides.blurDataUrl,
      mobileR2Key: campaignSlides.mobileR2Key,
    })
    .from(campaignSlides)
    .where(includeInactive ? undefined : eq(campaignSlides.active, true))
    .orderBy(asc(campaignSlides.sortOrder), asc(campaignSlides.createdAt));

  return rows.map((row) => ({
    id: row.id,
    imageUrl: `/api/campaign-media/${row.id}`,
    mobileImageUrl: row.mobileR2Key ? `/api/campaign-media/${row.id}?variant=mobile` : null,
    altText: row.altText,
    eyebrow: row.eyebrow,
    headline: row.headline,
    body: row.body,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    sortOrder: row.sortOrder,
    blurDataUrl: row.blurDataUrl ?? undefined,
  }));
}

export async function getCollectionBySlug(
  slug: string,
): Promise<{ name: string; description: string; products: CatalogProduct[] } | null> {
  const [collection] = await db
    .select({ id: collections.id, name: collections.name, description: collections.description })
    .from(collections)
    .where(and(eq(collections.slug, slug), eq(collections.status, "active")))
    .limit(1);
  if (!collection) return null;

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      type: products.typeLabel,
      badge: products.badge,
      categoryId: products.categoryId,
      categorySlug: categories.slug,
      variantId: productVariants.id,
      sku: productVariants.sku,
      color: productVariants.color,
      price: productVariants.price,
      stock: productVariants.stockQuantity,
      reserved: productVariants.reservedQuantity,
      imageId: productImages.id,
      blurDataUrl: productImages.blurDataUrl,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(productCollections, eq(productCollections.productId, products.id))
    .innerJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.isDefault, true)))
    .leftJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.isPrimary, true)))
    .where(and(eq(productCollections.collectionId, collection.id), eq(products.status, "published")))
    .orderBy(desc(products.publishedAt));

  const variantImagesByProduct = await getVariantLeadImages(rows.map((row) => row.id));

  return {
    name: collection.name,
    description: collection.description ?? "",
    products: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.categorySlug,
      categoryId: row.categoryId,
      type: row.type,
      price: row.price,
      color: row.color,
      badge: row.badge ?? "",
      sku: row.sku,
      imageUrl: row.imageId ? imageUrlFor(row.imageId) : undefined,
      blurDataUrl: row.blurDataUrl ?? undefined,
      stock: Math.max(0, row.stock - row.reserved),
      variants: [],
      images: [],
      variantImages: variantImagesByProduct.get(row.id) ?? [],
    })),
  };
}

/** Minimal listing of active collections (id/slug/name) for sitemap generation. */
export async function getActiveCollections(): Promise<{ id: string; slug: string; name: string }[]> {
  return db
    .select({ id: collections.id, slug: collections.slug, name: collections.name })
    .from(collections)
    .where(eq(collections.status, "active"))
    .orderBy(asc(collections.sortOrder));
}

export type CategoryWithImage = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
  blurDataUrl?: string;
};

/** Active categories with their (optional) admin-uploaded cover photo — drives the homepage
 * "Objects of everyday elegance" cards and each /collections/[slug] hero banner. Categories
 * without an uploaded image simply omit imageUrl; callers fall back to a static placeholder. */
export async function getActiveCategories(): Promise<CategoryWithImage[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      imageR2Key: categories.imageR2Key,
      blurDataUrl: categories.imageBlurDataUrl,
    })
    .from(categories)
    .where(eq(categories.status, "active"))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    imageUrl: row.imageR2Key ? `/api/category-media/${row.id}` : undefined,
    blurDataUrl: row.blurDataUrl ?? undefined,
  }));
}

export type FeedVariant = {
  variantId: string;
  sku: string;
  color: string;
  price: number;
  available: number;
  gtin?: string;
};

export type FeedProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  googleProductCategory?: string;
  imageId?: string;
  variants: FeedVariant[];
};

/** Published products with all active variants + primary image, shaped for the Google Merchant
 * Center and Meta catalogue feed routes (app/api/feeds/google, app/api/feeds/meta). */
export async function getFeedProducts(): Promise<FeedProduct[]> {
  const rows = await db
    .select({
      productId: products.id,
      slug: products.slug,
      name: products.name,
      description: products.shortDescription,
      longDescription: products.description,
      googleProductCategory: products.googleProductCategory,
      variantId: productVariants.id,
      sku: productVariants.sku,
      color: productVariants.color,
      price: productVariants.price,
      stock: productVariants.stockQuantity,
      reserved: productVariants.reservedQuantity,
      gtin: productVariants.gtin,
      imageId: productImages.id,
    })
    .from(products)
    .innerJoin(productVariants, and(eq(productVariants.productId, products.id), eq(productVariants.status, "active")))
    .leftJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.isPrimary, true), eq(productImages.status, "active")))
    .where(eq(products.status, "published"))
    .orderBy(asc(products.createdAt));

  const byProduct = new Map<string, FeedProduct>();
  for (const row of rows) {
    let entry = byProduct.get(row.productId);
    if (!entry) {
      entry = {
        id: row.productId,
        slug: row.slug,
        name: row.name,
        description: row.description || row.longDescription || "",
        googleProductCategory: row.googleProductCategory ?? undefined,
        imageId: row.imageId ?? undefined,
        variants: [],
      };
      byProduct.set(row.productId, entry);
    }
    entry.variants.push({
      variantId: row.variantId,
      sku: row.sku,
      color: row.color,
      price: row.price,
      available: Math.max(0, row.stock - row.reserved),
      gtin: row.gtin ?? undefined,
    });
  }

  return Array.from(byProduct.values());
}

export type PublicSettings = {
  whatsappNumber: string;
  supportPhone: string;
  supportEmail: string;
  instagramUrl: string;
  freeDeliveryThreshold: number;
  metaPixelId: string;
  gaMeasurementId: string;
  brandName: string;
  codReservationHours: number;
  bankReservationHours: number;
};

export async function getPublicSettings(): Promise<PublicSettings> {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.id, "store")).limit(1);
  return {
    whatsappNumber: row?.whatsappNumber || process.env.WHATSAPP_DEFAULT_NUMBER || "",
    supportPhone: row?.supportPhone ?? "",
    supportEmail: row?.supportEmail ?? "",
    instagramUrl: row?.instagramUrl ?? "",
    freeDeliveryThreshold: row?.freeDeliveryThreshold ?? 4000,
    metaPixelId: row?.metaPixelId ?? "",
    gaMeasurementId: row?.gaMeasurementId ?? "",
    brandName: row?.brandName ?? "Muse & Silk",
    codReservationHours: row?.codReservationHours ?? 6,
    bankReservationHours: row?.bankReservationHours ?? 6,
  };
}
