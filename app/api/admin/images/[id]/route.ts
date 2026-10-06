import { z } from "zod";
import { runInBackground } from "@/lib/background";
import { syncProductSearch } from "@/lib/search/algolia";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { productImages, productVariants } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { deleteObject } from "@/lib/storage";
import { auditLogEntry } from "@/lib/admin/audit";
import { variantKeyFor } from "@/lib/image-variants";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  altText: z.string().min(1).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isPrimary: z.boolean().optional(),
  /** Which colour's photo this is (any variant of that colour); null makes it a shared, whole-product photo. */
  variantId: z.string().uuid().nullable().optional(),
  focalPointX: z.coerce.number().int().min(0).max(100).optional(),
  focalPointY: z.coerce.number().int().min(0).max(100).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid image payload." }, { status: 400 });
  const data = parsed.data;

  if (data.altText !== undefined && !data.altText.trim()) {
    return Response.json({ error: "Alt text cannot be empty." }, { status: 400 });
  }

  const [existing] = await db.select().from(productImages).where(eq(productImages.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Image not found." }, { status: 404 });

  if (data.variantId) {
    const [variant] = await db.select({ productId: productVariants.productId }).from(productVariants).where(eq(productVariants.id, data.variantId)).limit(1);
    if (!variant || variant.productId !== existing.productId) return Response.json({ error: "That colour does not belong to this product." }, { status: 400 });
  }

  if (data.isPrimary === true) {
    await db.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, existing.productId));
  }

  const [row] = await db
    .update(productImages)
    .set({
      ...(data.altText !== undefined ? { altText: data.altText } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}),
      ...(data.variantId !== undefined ? { variantId: data.variantId } : {}),
      ...(data.focalPointX !== undefined ? { focalPointX: data.focalPointX } : {}),
      ...(data.focalPointY !== undefined ? { focalPointY: data.focalPointY } : {}),
    })
    .where(eq(productImages.id, id))
    .returning();

  await auditLogEntry({ actorEmail: admin.email, action: "image.update", entityType: "product", entityId: existing.productId, detail: { imageId: id, ...data } });

  runInBackground(syncProductSearch(existing.productId), "syncProductSearch");

  return Response.json({ image: row });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [existing] = await db.select().from(productImages).where(eq(productImages.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Image not found." }, { status: 404 });

  await db.delete(productImages).where(eq(productImages.id, id));
  await deleteObject(existing.r2Key);
  // Also remove the resized WebP variants generated at upload time (see lib/client-image-processing.ts)
  // — these are separate R2 objects from the original and were previously left orphaned on delete.
  if (existing.variantWidths?.length) {
    await Promise.all(existing.variantWidths.map((width) => deleteObject(variantKeyFor(existing.r2Key, width))));
  }

  await auditLogEntry({ actorEmail: admin.email, action: "image.delete", entityType: "product", entityId: existing.productId, detail: { imageId: id } });

  runInBackground(syncProductSearch(existing.productId), "syncProductSearch");

  return Response.json({ ok: true });
}
