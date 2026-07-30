import { eq } from "drizzle-orm";
import { db } from "@/db";
import { productImages } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { validateImageUpload } from "@/lib/validation";
import { newObjectKey, putObject } from "@/lib/r2";
import { auditLogEntry } from "@/lib/admin/audit";
import { processUploadedImage, variantKeyFor } from "@/lib/image-processing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const productId = form.get("productId");
  const variantId = form.get("variantId");
  const altText = form.get("altText");
  const sortOrder = form.get("sortOrder");
  const isPrimary = form.get("isPrimary");

  if (!(file instanceof File)) return Response.json({ error: "An image file is required." }, { status: 400 });
  if (typeof productId !== "string" || !productId) return Response.json({ error: "productId is required." }, { status: 400 });
  if (typeof altText !== "string" || !altText.trim()) {
    return Response.json({ error: "Image description (alt text) is required." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const validation = validateImageUpload(contentType, bytes);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });

  const key = newObjectKey("products", contentType);
  await putObject(key, bytes, contentType);

  // Best-effort: generate resized WebP variants + a blur-up placeholder. If this fails for any
  // reason (unusual image, decoder edge case), the original upload above is already safely stored
  // and still fully usable — the product simply won't have optimized variants for this image.
  const processed = await processUploadedImage(bytes, contentType);
  if (processed) {
    await Promise.all(
      processed.variants.map((variant) => putObject(variantKeyFor(key, variant.width), variant.bytes, "image/webp")),
    );
  }

  const makePrimary = isPrimary === "true" || isPrimary === "on";
  if (makePrimary) {
    await db.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, productId));
  }

  const [row] = await db
    .insert(productImages)
    .values({
      productId,
      variantId: typeof variantId === "string" && variantId ? variantId : null,
      r2Key: key,
      altText: altText.trim(),
      contentType,
      byteSize: bytes.byteLength,
      width: processed?.width,
      height: processed?.height,
      blurDataUrl: processed?.blurDataUrl,
      variantWidths: processed?.variants.map((v) => v.width),
      sortOrder: typeof sortOrder === "string" && sortOrder ? Number(sortOrder) : 0,
      isPrimary: makePrimary,
    })
    .returning();

  await auditLogEntry({
    actorEmail: admin.email,
    action: "image.create",
    entityType: "product",
    entityId: productId,
    detail: { imageId: row.id, altText: row.altText },
  });

  return Response.json({ image: row }, { status: 201 });
}
