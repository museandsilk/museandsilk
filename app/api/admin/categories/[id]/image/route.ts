import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { validateImageUpload } from "@/lib/validation";
import { newObjectKey, putObject, deleteObject } from "@/lib/r2";
import { auditLogEntry } from "@/lib/admin/audit";
import { variantKeyFor } from "@/lib/image-variants";

export const dynamic = "force-dynamic";

type ExistingImage = { r2Key: string | null; variantWidths: number[] | null };

async function deleteExisting(image: ExistingImage) {
  if (!image.r2Key) return;
  await deleteObject(image.r2Key).catch(() => {});
  if (image.variantWidths?.length) {
    await Promise.all(image.variantWidths.map((w) => deleteObject(variantKeyFor(image.r2Key as string, w)).catch(() => {})));
  }
}

/** Processes one uploaded image (already cropped and resized client-side — see
 * lib/client-image-processing.ts) into R2, reading its fields from `form` under the given prefix
 * ("" for the card image, "hero" for the hero image — matches the campaign slide desktop/mobile
 * convention in app/api/admin/campaign/[id]/image/route.ts). Returns null if no file was provided
 * under this prefix, so the caller can tell "not included in this request" apart from "upload
 * failed". */
async function processUpload(form: FormData, prefix: string) {
  const file = form.get(prefix ? `${prefix}File` : "file");
  if (!(file instanceof File)) return null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const validation = validateImageUpload(contentType, bytes);
  if (!validation.ok) return { error: validation.error } as const;

  const key = newObjectKey("categories", contentType);
  await putObject(key, bytes, contentType);

  let blurDataUrl: string | undefined;
  const storedVariantWidths: number[] = [];
  const blurField = form.get(`${prefix}blurDataUrl`);
  const variantWidthsField = form.get(`${prefix}variantWidths`);
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
        const variantFile = form.get(`${prefix}variant_${w}`);
        if (!(variantFile instanceof File)) continue;
        const variantBytes = new Uint8Array(await variantFile.arrayBuffer());
        const variantValidation = validateImageUpload("image/webp", variantBytes);
        if (!variantValidation.ok) continue;
        await putObject(variantKeyFor(key, w), variantBytes, "image/webp");
        storedVariantWidths.push(w);
      }
    }
  }

  return { key, contentType, byteSize: bytes.byteLength, blurDataUrl, variantWidths: storedVariantWidths } as const;
}

/** Sets or replaces a category's card image (homepage grid, 3:4) and/or hero image (collection
 * page banner, wide) — each is independent: sending only `heroFile` updates just the hero crop
 * without touching the existing card image, and vice versa. At least one of the two is required. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [existing] = await db
    .select({
      imageR2Key: categories.imageR2Key,
      imageVariantWidths: categories.imageVariantWidths,
      heroR2Key: categories.heroR2Key,
      heroVariantWidths: categories.heroVariantWidths,
    })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!existing) return Response.json({ error: "Category not found." }, { status: 404 });

  const form = await request.formData();
  const altText = form.get("altText");

  const card = await processUpload(form, "");
  if (card && "error" in card) return Response.json({ error: card.error }, { status: 400 });
  const hero = await processUpload(form, "hero");
  if (hero && "error" in hero) return Response.json({ error: hero.error }, { status: 400 });

  if (!card && !hero) return Response.json({ error: "An image file is required." }, { status: 400 });

  const [row] = await db
    .update(categories)
    .set({
      ...(card
        ? {
            imageR2Key: card.key,
            imageAltText: typeof altText === "string" && altText.trim() ? altText.trim() : null,
            imageContentType: card.contentType,
            imageByteSize: card.byteSize,
            imageBlurDataUrl: card.blurDataUrl,
            imageVariantWidths: card.variantWidths.length ? card.variantWidths : undefined,
          }
        : {}),
      ...(hero
        ? {
            heroR2Key: hero.key,
            heroContentType: hero.contentType,
            heroByteSize: hero.byteSize,
            heroBlurDataUrl: hero.blurDataUrl,
            heroVariantWidths: hero.variantWidths.length ? hero.variantWidths : undefined,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(categories.id, id))
    .returning();

  // Old objects are only removed after the new ones are safely written and the row updated, so a
  // failed upload never leaves the category without any image.
  if (card) await deleteExisting({ r2Key: existing.imageR2Key, variantWidths: existing.imageVariantWidths });
  if (hero) await deleteExisting({ r2Key: existing.heroR2Key, variantWidths: existing.heroVariantWidths });

  await auditLogEntry({
    actorEmail: admin.email,
    action: "category.image.update",
    entityType: "category",
    entityId: id,
    detail: { card: Boolean(card), hero: Boolean(hero) },
  });

  return Response.json({ category: row });
}

/** Removes a category's card image by default, or its hero image with ?target=hero. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const target = new URL(request.url).searchParams.get("target") === "hero" ? "hero" : "card";

  const [existing] = await db
    .select({
      imageR2Key: categories.imageR2Key,
      imageVariantWidths: categories.imageVariantWidths,
      heroR2Key: categories.heroR2Key,
      heroVariantWidths: categories.heroVariantWidths,
    })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!existing) return Response.json({ error: "Category not found." }, { status: 404 });

  const [row] = await db
    .update(categories)
    .set(
      target === "hero"
        ? { heroR2Key: null, heroAltText: null, heroContentType: null, heroByteSize: null, heroBlurDataUrl: null, heroVariantWidths: null, updatedAt: new Date() }
        : { imageR2Key: null, imageAltText: null, imageContentType: null, imageByteSize: null, imageBlurDataUrl: null, imageVariantWidths: null, updatedAt: new Date() },
    )
    .where(eq(categories.id, id))
    .returning();

  await deleteExisting(
    target === "hero"
      ? { r2Key: existing.heroR2Key, variantWidths: existing.heroVariantWidths }
      : { r2Key: existing.imageR2Key, variantWidths: existing.imageVariantWidths },
  );

  await auditLogEntry({ actorEmail: admin.email, action: "category.image.remove", entityType: "category", entityId: id, detail: { target } });

  return Response.json({ category: row });
}
