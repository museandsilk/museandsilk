import { ilike } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, productVariants } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { slugify } from "@/lib/slug";
import { auditLogEntry } from "@/lib/admin/audit";
import { generateSeoFields } from "@/lib/ai/seo";
import { isUniqueViolation } from "@/lib/db/errors";
import { productImportBatchSchema, type ProductImport } from "@/lib/import/product-import-schema";

export const dynamic = "force-dynamic";

type ImportResult = {
  index: number;
  name: string;
  success: boolean;
  productId?: string;
  imageUrls?: string[];
  variantErrors?: string[];
  error?: string;
};

async function importOne(item: ProductImport, index: number): Promise<ImportResult> {
  const [category] = await db.select({ id: categories.id, name: categories.name }).from(categories).where(ilike(categories.name, item.category)).limit(1);
  if (!category) {
    return { index, name: item.name, success: false, error: `Category "${item.category}" not found — check spelling or create it first.` };
  }

  const slug = slugify(item.slug || item.name);
  const seo = await generateSeoFields({
    name: item.name,
    typeLabel: item.typeLabel,
    categoryName: category.name,
    color: item.primaryColour,
    material: item.material,
    shortDescription: item.shortDescription,
    description: item.description,
  });

  let productRow;
  try {
    [productRow] = await db
      .insert(products)
      .values({
        categoryId: category.id,
        name: item.name,
        slug,
        typeLabel: item.typeLabel,
        shortDescription: item.shortDescription || null,
        description: item.description || null,
        material: item.material || null,
        dimensions: item.dimensions || null,
        careInstructions: item.careInstructions || null,
        status: item.status ?? "draft",
        featured: item.featured ?? false,
        badge: item.badge || null,
        seoTitle: seo?.seoTitle ?? null,
        seoDescription: seo?.seoDescription ?? null,
        pattern: item.pattern || null,
        primaryColour: item.primaryColour || null,
        occasion: item.occasion || null,
        style: item.style || null,
        countryOfOrigin: item.countryOfOrigin || null,
        gender: item.gender ?? "female",
        googleProductCategory: item.googleProductCategory || null,
        publishedAt: item.status === "published" ? new Date() : null,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { index, name: item.name, success: false, error: `A product with a matching URL slug ("${slug}") already exists.` };
    }
    throw error;
  }

  const variantInputs = item.variants?.length
    ? item.variants
    : [
        {
          name: item.name,
          color: item.primaryColour || item.name,
          sku: item.sku!,
          price: item.price!,
          compareAtPrice: item.compareAtPrice,
          stockQuantity: item.stockQuantity,
          lowStockThreshold: item.lowStockThreshold,
          isDefault: true,
        },
      ];

  const variantErrors: string[] = [];
  for (let variantIndex = 0; variantIndex < variantInputs.length; variantIndex++) {
    const variant = variantInputs[variantIndex];
    try {
      await db.insert(productVariants).values({
        productId: productRow.id,
        name: variant.name || item.name,
        sku: variant.sku,
        color: variant.color,
        size: variant.size || null,
        fabric: variant.fabric || null,
        gtin: variant.gtin || null,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice ?? null,
        stockQuantity: variant.stockQuantity ?? 0,
        lowStockThreshold: variant.lowStockThreshold ?? 3,
        isDefault: variant.isDefault ?? variantIndex === 0,
        status: "active",
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        variantErrors.push(`SKU "${variant.sku}" is already in use.`);
      } else {
        throw error;
      }
    }
  }

  return {
    index,
    name: item.name,
    success: true,
    productId: productRow.id,
    imageUrls: item.imageUrls,
    variantErrors: variantErrors.length ? variantErrors : undefined,
  };
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = productImportBatchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid import payload.", details: parsed.error.issues }, { status: 400 });
  }
  const items = "products" in parsed.data ? parsed.data.products : [parsed.data];

  const results: ImportResult[] = [];
  for (let index = 0; index < items.length; index++) {
    try {
      results.push(await importOne(items[index], index));
    } catch (error) {
      console.error("product.import failed", error);
      results.push({ index, name: items[index].name, success: false, error: "Unexpected server error — see logs." });
    }
  }

  const succeeded = results.filter((r) => r.success);
  if (succeeded.length) {
    await auditLogEntry({
      actorEmail: admin.email,
      action: "product.import",
      entityType: "product",
      entityId: succeeded.map((r) => r.productId).join(","),
      detail: { imported: succeeded.length, failed: results.length - succeeded.length },
    });
  }

  return Response.json({ results });
}
