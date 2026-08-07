import { asc } from "drizzle-orm";
import { db } from "@/db";
import { campaignSlides } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { validateImageUpload } from "@/lib/validation";
import { newObjectKey, putObject } from "@/lib/r2";
import { auditLogEntry } from "@/lib/admin/audit";
import { storeVariantsFromForm } from "@/lib/admin/campaign-images";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(campaignSlides).orderBy(asc(campaignSlides.sortOrder), asc(campaignSlides.createdAt));
  return Response.json({
    // Versioned so the admin's own preview thumbnail updates immediately after a replace —
    // /api/campaign-media is cached at Cloudflare's edge as immutable for a year, keyed by URL,
    // and this row's id (unlike a fresh upload's r2Key) never changes across replacements.
    slides: rows.map((row) => ({ ...row, imageUrl: `/api/campaign-media/${row.id}?v=${row.updatedAt.getTime()}` })),
  });
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const altText = form.get("altText");
  if (!(file instanceof File)) return Response.json({ error: "An image file is required." }, { status: 400 });
  if (typeof altText !== "string" || !altText.trim()) {
    return Response.json({ error: "Accessible image description is required." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const validation = validateImageUpload(contentType, bytes);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });

  const key = newObjectKey("campaign", contentType);
  await putObject(key, bytes, contentType);

  // See app/api/admin/images/route.ts for why variants arrive pre-made from the browser rather
  // than being generated here.
  const desktop = await storeVariantsFromForm(form, "", key);

  // Optional separately cropped image for narrow viewports (see db/schema.ts's mobile* columns).
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

  const eyebrow = form.get("eyebrow");
  const headline = form.get("headline");
  const body = form.get("body");
  const ctaLabel = form.get("ctaLabel");
  const ctaHref = form.get("ctaHref");
  const sortOrder = form.get("sortOrder");
  const active = form.get("active");

  const [row] = await db
    .insert(campaignSlides)
    .values({
      r2Key: key,
      altText: altText.trim(),
      contentType,
      byteSize: bytes.byteLength,
      blurDataUrl: desktop.blurDataUrl,
      variantWidths: desktop.widths.length ? desktop.widths : undefined,
      ...(mobileKey
        ? {
            mobileR2Key: mobileKey,
            mobileContentType,
            mobileByteSize,
            mobileBlurDataUrl: mobile.blurDataUrl,
            mobileVariantWidths: mobile.widths.length ? mobile.widths : undefined,
          }
        : {}),
      ...(typeof eyebrow === "string" && eyebrow ? { eyebrow } : {}),
      ...(typeof headline === "string" && headline ? { headline } : {}),
      ...(typeof body === "string" && body ? { body } : {}),
      ...(typeof ctaLabel === "string" && ctaLabel ? { ctaLabel } : {}),
      ...(typeof ctaHref === "string" && ctaHref ? { ctaHref } : {}),
      sortOrder: typeof sortOrder === "string" && sortOrder ? Number(sortOrder) : 0,
      active: active === null ? true : active === "true" || active === "on",
    })
    .returning();

  await auditLogEntry({ actorEmail: admin.email, action: "campaign.create", entityType: "campaign-slide", entityId: row.id });

  return Response.json({ slide: { ...row, imageUrl: `/api/campaign-media/${row.id}` } }, { status: 201 });
}
