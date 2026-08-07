import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignSlides } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { deleteObject } from "@/lib/r2";
import { auditLogEntry } from "@/lib/admin/audit";
import { variantKeyFor } from "@/lib/image-variants";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  altText: z.string().min(1).optional(),
  eyebrow: z.string().optional(),
  headline: z.string().optional(),
  body: z.string().optional(),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid campaign slide payload." }, { status: 400 });
  const data = parsed.data;

  const [row] = await db
    .update(campaignSlides)
    .set({
      ...(data.altText !== undefined ? { altText: data.altText } : {}),
      ...(data.eyebrow !== undefined ? { eyebrow: data.eyebrow } : {}),
      ...(data.headline !== undefined ? { headline: data.headline } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.ctaLabel !== undefined ? { ctaLabel: data.ctaLabel } : {}),
      ...(data.ctaHref !== undefined ? { ctaHref: data.ctaHref } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(campaignSlides.id, id))
    .returning();
  if (!row) return Response.json({ error: "Campaign slide not found." }, { status: 404 });

  await auditLogEntry({ actorEmail: admin.email, action: "campaign.update", entityType: "campaign-slide", entityId: id, detail: data });

  return Response.json({ slide: { ...row, imageUrl: `/api/campaign-media/${row.id}` } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [existing] = await db.select().from(campaignSlides).where(eq(campaignSlides.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Campaign slide not found." }, { status: 404 });

  await db.delete(campaignSlides).where(eq(campaignSlides.id, id));
  await deleteObject(existing.r2Key);
  if (existing.variantWidths?.length) {
    await Promise.all(existing.variantWidths.map((width) => deleteObject(variantKeyFor(existing.r2Key, width))));
  }
  // The desktop image above was the only one ever cleaned up here — a slide with a separate mobile
  // crop (see db/schema.ts's mobile* columns) left it and its variants permanently orphaned in R2
  // every time the whole slide was deleted.
  if (existing.mobileR2Key) {
    await deleteObject(existing.mobileR2Key);
    if (existing.mobileVariantWidths?.length) {
      await Promise.all(
        existing.mobileVariantWidths.map((width) => deleteObject(variantKeyFor(existing.mobileR2Key as string, width))),
      );
    }
  }

  await auditLogEntry({ actorEmail: admin.email, action: "campaign.delete", entityType: "campaign-slide", entityId: id });

  return Response.json({ ok: true });
}
