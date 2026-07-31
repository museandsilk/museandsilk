import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productImages, products, productVariants } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { slugify } from "@/lib/slug";
import { auditLogEntry } from "@/lib/admin/audit";
import { deleteObject } from "@/lib/r2";
import { variantKeyFor } from "@/lib/image-variants";

export const dynamic = "force-dynamic";

const genderEnum = z.enum(["female", "male", "unisex"]);
const statusEnum = z.enum(["draft", "published", "archived"]);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  typeLabel: z.string().min(1).optional(),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  material: z.string().optional(),
  dimensions: z.string().optional(),
  careInstructions: z.string().optional(),
  status: statusEnum.optional(),
  featured: z.boolean().optional(),
  badge: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  pattern: z.string().optional(),
  primaryColour: z.string().optional(),
  occasion: z.string().optional(),
  style: z.string().optional(),
  countryOfOrigin: z.string().optional(),
  gender: genderEnum.optional(),
  googleProductCategory: z.string().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return Response.json({ error: "Product not found." }, { status: 404 });

  const [variants, images] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id))
      .orderBy(desc(productVariants.isDefault), asc(productVariants.createdAt)),
    db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(desc(productImages.isPrimary), asc(productImages.sortOrder), asc(productImages.createdAt)),
  ]);

  return Response.json({ product, variants, images });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid product payload." }, { status: 400 });
  const data = parsed.data;

  const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Product not found." }, { status: 404 });

  const becomingPublished = data.status === "published" && existing.status !== "published";

  const [row] = await db
    .update(products)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.slug !== undefined ? { slug: slugify(data.slug) } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
      ...(data.typeLabel !== undefined ? { typeLabel: data.typeLabel } : {}),
      ...(data.shortDescription !== undefined ? { shortDescription: data.shortDescription || null } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.material !== undefined ? { material: data.material || null } : {}),
      ...(data.dimensions !== undefined ? { dimensions: data.dimensions || null } : {}),
      ...(data.careInstructions !== undefined ? { careInstructions: data.careInstructions || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.featured !== undefined ? { featured: data.featured } : {}),
      ...(data.badge !== undefined ? { badge: data.badge || null } : {}),
      ...(data.seoTitle !== undefined ? { seoTitle: data.seoTitle || null } : {}),
      ...(data.seoDescription !== undefined ? { seoDescription: data.seoDescription || null } : {}),
      ...(data.pattern !== undefined ? { pattern: data.pattern || null } : {}),
      ...(data.primaryColour !== undefined ? { primaryColour: data.primaryColour || null } : {}),
      ...(data.occasion !== undefined ? { occasion: data.occasion || null } : {}),
      ...(data.style !== undefined ? { style: data.style || null } : {}),
      ...(data.countryOfOrigin !== undefined ? { countryOfOrigin: data.countryOfOrigin || null } : {}),
      ...(data.gender !== undefined ? { gender: data.gender } : {}),
      ...(data.googleProductCategory !== undefined ? { googleProductCategory: data.googleProductCategory || null } : {}),
      ...(becomingPublished ? { publishedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning();

  await auditLogEntry({ actorEmail: admin.email, action: "product.update", entityType: "product", entityId: id, detail: data });

  return Response.json({ product: row });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const permanent = new URL(request.url).searchParams.get("permanent") === "true";

  if (!permanent) {
    // Default, reversible action: hide from the storefront, keep everything (can be republished).
    const [row] = await db
      .update(products)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    if (!row) return Response.json({ error: "Product not found." }, { status: 404 });

    await auditLogEntry({ actorEmail: admin.email, action: "product.archive", entityType: "product", entityId: id });
    return Response.json({ ok: true });
  }

  // Permanent delete: remove the product row first — productVariants and productImages cascade-
  // delete at the database level (see db/schema.ts's onDelete: "cascade" on both tables' productId
  // foreign key, and on inventory_movements' variantId key). Order history is unaffected: order_items
  // snapshot product/variant names, SKUs and prices at time of purchase and only set their
  // productId/variantId to null (onDelete: "set null"), never cascade-deleted.
  // Only once the DB delete has actually succeeded do we free the R2 objects — deleting storage
  // first would leave orphaned, image-less DB rows behind if the DB step then failed for any reason.
  const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Product not found." }, { status: 404 });

  const images = await db
    .select({ r2Key: productImages.r2Key, variantWidths: productImages.variantWidths })
    .from(productImages)
    .where(eq(productImages.productId, id));

  try {
    await db.delete(products).where(eq(products.id, id));
  } catch (error) {
    console.error("product.delete_permanent failed", error);
    return Response.json({ error: "Could not delete product — it may still be referenced elsewhere." }, { status: 500 });
  }

  await Promise.all(
    images.flatMap((image) => [
      deleteObject(image.r2Key),
      ...(image.variantWidths ?? []).map((width) => deleteObject(variantKeyFor(image.r2Key, width))),
    ]),
  );

  await auditLogEntry({ actorEmail: admin.email, action: "product.delete_permanent", entityType: "product", entityId: id, detail: { imagesDeleted: images.length } });

  return Response.json({ ok: true });
}
