import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { productImages } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";
import { variantKeyFor } from "@/lib/image-variants";
import { getSoldoutDays, idleSoldOutProducts } from "@/lib/soldout-cleanup";
import { deleteObject, newObjectKey, putObject } from "@/lib/storage";
import { validateImageUpload } from "@/lib/validation";

export const dynamic = "force-dynamic";

const FALLBACK_DAYS = 90;

/**
 * Replaces a sold-out product's photo with a smaller copy made in the owner's browser (same picture, lower resolution, stronger
 * compression). Only photos of products that really have been sold out for a long time are accepted, the new files are saved first,
 * and the old ones are removed only after the database points at the new ones – a failure part-way never loses a picture.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Picture not found." }, { status: 404 });

  const [image] = await db.select().from(productImages).where(eq(productImages.id, id)).limit(1);
  if (!image) return Response.json({ error: "Picture not found." }, { status: 404 });
  if (image.compactedAt) return Response.json({ ok: true, skipped: true });

  const days = (await getSoldoutDays()) || FALLBACK_DAYS;
  const idle = (await db.execute(sql`select 1 from (${idleSoldOutProducts(days)}) as idle where idle.id = ${image.productId}`)) as unknown as { rows: unknown[] };
  if (!idle.rows?.length) return Response.json({ error: "This product is on sale again, so its pictures are left as they are." }, { status: 409 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "A picture file is required." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateImageUpload("image/webp", bytes);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });
  // Never make a picture bigger: the point is to save space.
  if (bytes.byteLength >= image.byteSize) return Response.json({ ok: true, skipped: true, reason: "already small" });

  const key = newObjectKey("products", "image/webp");
  const stored: string[] = [];
  const widths: number[] = [];
  try {
    await putObject(key, bytes, "image/webp");
    stored.push(key);
    let parsed: unknown = [];
    try {
      parsed = JSON.parse(String(form.get("variantWidths") ?? "[]"));
    } catch {
      parsed = [];
    }
    for (const w of Array.isArray(parsed) ? parsed : []) {
      if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) continue;
      const variantFile = form.get(`variant_${w}`);
      if (!(variantFile instanceof File)) continue;
      const variantBytes = new Uint8Array(await variantFile.arrayBuffer());
      if (!validateImageUpload("image/webp", variantBytes).ok) continue;
      await putObject(variantKeyFor(key, w), variantBytes, "image/webp");
      stored.push(variantKeyFor(key, w));
      widths.push(w);
    }
    const width = Number(form.get("width")) || image.width;
    const height = Number(form.get("height")) || image.height;
    await db
      .update(productImages)
      .set({ r2Key: key, contentType: "image/webp", byteSize: bytes.byteLength, width, height, variantWidths: widths.length ? widths : null, compactedAt: new Date() })
      .where(eq(productImages.id, id));
  } catch (error) {
    await Promise.all(stored.map((k) => deleteObject(k).catch(() => undefined)));
    console.error("photo compaction failed", error);
    return Response.json({ error: "Could not save the smaller picture." }, { status: 500 });
  }

  await deleteObject(image.r2Key).catch(() => undefined);
  await Promise.all((image.variantWidths ?? []).map((w) => deleteObject(variantKeyFor(image.r2Key, w)).catch(() => undefined)));
  await auditLogEntry({ actorEmail: admin.email, action: "image.shrink", entityType: "product", entityId: image.productId, detail: { imageId: id, before: image.byteSize, after: bytes.byteLength } });
  return Response.json({ ok: true, saved: image.byteSize - bytes.byteLength });
}
