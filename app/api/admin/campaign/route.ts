import { asc } from "drizzle-orm";
import { db } from "@/db";
import { campaignSlides } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { validateImageUpload } from "@/lib/validation";
import { newObjectKey, putObject } from "@/lib/r2";
import { auditLogEntry } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(campaignSlides).orderBy(asc(campaignSlides.sortOrder), asc(campaignSlides.createdAt));
  return Response.json({
    slides: rows.map((row) => ({ ...row, imageUrl: `/api/campaign-media/${row.id}` })),
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
