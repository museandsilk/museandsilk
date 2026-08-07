import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignSlides } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { validateImageUpload } from "@/lib/validation";
import { newObjectKey, putObject, deleteObject } from "@/lib/r2";
import { auditLogEntry } from "@/lib/admin/audit";
import { variantKeyFor } from "@/lib/image-variants";
import { storeVariantsFromForm } from "@/lib/admin/campaign-images";

export const dynamic = "force-dynamic";

/** Replaces an existing campaign slide's photo — the "New slide" form only ever creates a new
 * slide, so this is the only way to change a slide's picture without deleting and recreating it.
 * `file` (desktop) is always required; `mobileFile` is optional and only touches the separate
 * mobile crop when provided, leaving it as-is otherwise. Text fields are untouched — those still
 * go through the plain PATCH on /api/admin/campaign/[id]. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [existing] = await db.select().from(campaignSlides).where(eq(campaignSlides.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Campaign slide not found." }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  const altText = form.get("altText");
  if (!(file instanceof File)) return Response.json({ error: "A desktop image file is required." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const validation = validateImageUpload(contentType, bytes);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });

  const key = newObjectKey("campaign", contentType);
  await putObject(key, bytes, contentType);
  const desktop = await storeVariantsFromForm(form, "", key);

  const mobileFile = form.get("mobileFile");
  let mobileKey: string | undefined;
  let mobileContentType: string | undefined;
  let mobileByteSize: number | undefined;
  let mobile: { widths: number[]; blurDataUrl?: string } = { widths: [] };
  if (mobileFile instanceof File) {
    const mobileBytes = new Uint8Array(await mobileFile.arrayBuffer());
    mobileContentType = mobileFile.type || "application/octet-stream";
    const mobileValidation = validateImageUpload(mobileContentType, mobileBytes);
    if (mobileValidation.ok) {
      mobileKey = newObjectKey("campaign", mobileContentType);
      await putObject(mobileKey, mobileBytes, mobileContentType);
      mobileByteSize = mobileBytes.byteLength;
      mobile = await storeVariantsFromForm(form, "mobile", mobileKey);
    }
  }

  const [row] = await db
    .update(campaignSlides)
    .set({
      r2Key: key,
      contentType,
      byteSize: bytes.byteLength,
      blurDataUrl: desktop.blurDataUrl,
      variantWidths: desktop.widths.length ? desktop.widths : undefined,
      ...(typeof altText === "string" && altText.trim() ? { altText: altText.trim() } : {}),
      ...(mobileKey
        ? {
            mobileR2Key: mobileKey,
            mobileContentType,
            mobileByteSize,
            mobileBlurDataUrl: mobile.blurDataUrl,
            mobileVariantWidths: mobile.widths.length ? mobile.widths : undefined,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(campaignSlides.id, id))
    .returning();

  // Old objects are only removed after the new ones are safely written and the row updated, so a
  // failure partway through never leaves the slide without any image.
  await deleteObject(existing.r2Key).catch(() => {});
  if (existing.variantWidths?.length) {
    await Promise.all(existing.variantWidths.map((w) => deleteObject(variantKeyFor(existing.r2Key, w)).catch(() => {})));
  }
  if (mobileKey && existing.mobileR2Key) {
    await deleteObject(existing.mobileR2Key).catch(() => {});
    if (existing.mobileVariantWidths?.length) {
      await Promise.all(
        existing.mobileVariantWidths.map((w) => deleteObject(variantKeyFor(existing.mobileR2Key as string, w)).catch(() => {})),
      );
    }
  }

  await auditLogEntry({ actorEmail: admin.email, action: "campaign.image.update", entityType: "campaign-slide", entityId: id });

  return Response.json({ slide: { ...row, imageUrl: `/api/campaign-media/${row.id}` } });
}
