import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { validateImageUpload } from "@/lib/validation";
import { newObjectKey, putObject, deleteObject } from "@/lib/r2";
import { auditLogEntry } from "@/lib/admin/audit";
import { variantKeyFor } from "@/lib/image-variants";

export const dynamic = "force-dynamic";

/** Replaces (or sets for the first time) a category's cover image — used for the homepage
 * "Objects of everyday elegance" cards and the collection hero banner. Variants arrive pre-made
 * from the browser (see lib/client-image-processing.ts) for the same reason as product images:
 * real image-codec work is too CPU-heavy for the deployed Worker's per-request budget. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [existing] = await db
    .select({ imageR2Key: categories.imageR2Key, imageVariantWidths: categories.imageVariantWidths })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!existing) return Response.json({ error: "Category not found." }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  const altText = form.get("altText");
  if (!(file instanceof File)) return Response.json({ error: "An image file is required." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const validation = validateImageUpload(contentType, bytes);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });

  const key = newObjectKey("categories", contentType);
  await putObject(key, bytes, contentType);

  let blurDataUrl: string | undefined;
  const storedVariantWidths: number[] = [];
  const blurField = form.get("blurDataUrl");
  const variantWidthsField = form.get("variantWidths");
  if (typeof blurField === "string" && blurField.startsWith("data:image/webp;base64,")) blurDataUrl = blurField;
  if (typeof variantWidthsField === "string") {
    let widths: unknown;
    try {
      widths = JSON.parse(variantWidthsField);
    } catch {
      widths = [];
    }
    if (Array.isArray(widths)) {
      for (const w of widths) {
        if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) continue;
        const variantFile = form.get(`variant_${w}`);
        if (!(variantFile instanceof File)) continue;
        const variantBytes = new Uint8Array(await variantFile.arrayBuffer());
        const variantValidation = validateImageUpload("image/webp", variantBytes);
        if (!variantValidation.ok) continue;
        await putObject(variantKeyFor(key, w), variantBytes, "image/webp");
        storedVariantWidths.push(w);
      }
    }
  }

  const [row] = await db
    .update(categories)
    .set({
      imageR2Key: key,
      imageAltText: typeof altText === "string" && altText.trim() ? altText.trim() : null,
      imageContentType: contentType,
      imageByteSize: bytes.byteLength,
      imageBlurDataUrl: blurDataUrl,
      imageVariantWidths: storedVariantWidths.length ? storedVariantWidths : undefined,
      updatedAt: new Date(),
    })
    .where(eq(categories.id, id))
    .returning();

  // Old objects are only removed after the new ones are safely written and the row updated, so a
  // failed upload never leaves the category without any image. Old variant files are cleaned up
  // too, not just the base — otherwise every replace leaves its previous resized copies behind.
  if (existing.imageR2Key) {
    await deleteObject(existing.imageR2Key).catch(() => {});
    if (existing.imageVariantWidths?.length) {
      await Promise.all(
        existing.imageVariantWidths.map((w) => deleteObject(variantKeyFor(existing.imageR2Key as string, w)).catch(() => {})),
      );
    }
  }

  await auditLogEntry({ actorEmail: admin.email, action: "category.image.update", entityType: "category", entityId: id });

  return Response.json({ category: row });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [existing] = await db
    .select({ imageR2Key: categories.imageR2Key, imageVariantWidths: categories.imageVariantWidths })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!existing) return Response.json({ error: "Category not found." }, { status: 404 });

  const [row] = await db
    .update(categories)
    .set({
      imageR2Key: null,
      imageAltText: null,
      imageContentType: null,
      imageByteSize: null,
      imageBlurDataUrl: null,
      imageVariantWidths: null,
      updatedAt: new Date(),
    })
    .where(eq(categories.id, id))
    .returning();

  if (existing.imageR2Key) {
    await deleteObject(existing.imageR2Key).catch(() => {});
    if (existing.imageVariantWidths?.length) {
      await Promise.all(
        existing.imageVariantWidths.map((w) => deleteObject(variantKeyFor(existing.imageR2Key as string, w)).catch(() => {})),
      );
    }
  }

  await auditLogEntry({ actorEmail: admin.email, action: "category.image.remove", entityType: "category", entityId: id });

  return Response.json({ category: row });
}
