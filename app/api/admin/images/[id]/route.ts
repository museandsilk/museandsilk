import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { productImages } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { deleteObject } from "@/lib/r2";
import { auditLogEntry } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  altText: z.string().min(1).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isPrimary: z.boolean().optional(),
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

  if (data.isPrimary === true) {
    await db.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, existing.productId));
  }

  const [row] = await db
    .update(productImages)
    .set({
      ...(data.altText !== undefined ? { altText: data.altText } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}),
      ...(data.focalPointX !== undefined ? { focalPointX: data.focalPointX } : {}),
      ...(data.focalPointY !== undefined ? { focalPointY: data.focalPointY } : {}),
    })
    .where(eq(productImages.id, id))
    .returning();

  await auditLogEntry({ actorEmail: admin.email, action: "image.update", entityType: "product", entityId: existing.productId, detail: { imageId: id, ...data } });

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

  await auditLogEntry({ actorEmail: admin.email, action: "image.delete", entityType: "product", entityId: existing.productId, detail: { imageId: id } });

  return Response.json({ ok: true });
}
