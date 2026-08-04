import { z } from "zod";

const genderEnum = z.enum(["female", "male", "unisex"]);
const statusEnum = z.enum(["draft", "published", "archived"]);

const importVariantSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().min(1),
  sku: z.string().min(1),
  size: z.string().optional(),
  fabric: z.string().optional(),
  gtin: z.string().optional(),
  price: z.coerce.number().int().min(0),
  compareAtPrice: z.coerce.number().int().min(0).optional(),
  stockQuantity: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
});

/**
 * One product per JSON object. A product is either single-variant (top-level sku/price, no
 * `variants` array) or multi-variant (a `variants` array, no top-level sku/price) — never both,
 * never neither. `imageUrls` is optional and best-effort only: the browser fetches each URL and
 * runs it through the same client-side resize/WebP pipeline as a manual upload (see
 * lib/client-image-processing.ts) — nothing is resized on the server, so this only works for
 * direct, public, CORS-enabled image URLs.
 */
export const productImportSchema = z
  .object({
    category: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().optional(),
    typeLabel: z.string().min(1),
    shortDescription: z.string().optional(),
    description: z.string().optional(),
    material: z.string().optional(),
    dimensions: z.string().optional(),
    careInstructions: z.string().optional(),
    status: statusEnum.optional(),
    featured: z.boolean().optional(),
    badge: z.string().optional(),
    pattern: z.string().optional(),
    primaryColour: z.string().optional(),
    occasion: z.string().optional(),
    style: z.string().optional(),
    countryOfOrigin: z.string().optional(),
    gender: genderEnum.optional(),
    googleProductCategory: z.string().optional(),
    imageUrls: z.array(z.string().url()).optional(),

    sku: z.string().min(1).optional(),
    price: z.coerce.number().int().min(0).optional(),
    compareAtPrice: z.coerce.number().int().min(0).optional(),
    stockQuantity: z.coerce.number().int().min(0).optional(),
    lowStockThreshold: z.coerce.number().int().min(0).optional(),

    variants: z.array(importVariantSchema).min(1).optional(),
  })
  .refine((data) => Boolean(data.variants?.length) !== Boolean(data.sku && data.price !== undefined), {
    message: 'Provide either top-level "sku" + "price" (single-variant) or a "variants" array (multi-variant) — not both, not neither.',
  });

export type ProductImport = z.infer<typeof productImportSchema>;

export const productImportBatchSchema = z.union([productImportSchema, z.object({ products: z.array(productImportSchema).min(1) })]);
