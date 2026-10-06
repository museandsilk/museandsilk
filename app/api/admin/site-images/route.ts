import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteImages } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";
import { storeVariantsFromForm } from "@/lib/admin/campaign-images";
import { variantKeyFor } from "@/lib/image-variants";
import { isSiteImageSlot } from "@/lib/site-images";
import { deleteObject, newObjectKey, putObject } from "@/lib/storage";
import { validateImageUpload } from "@/lib/validation";

export const dynamic = "force-dynamic";

async function removeStored(key: string, widths: number[] | null) {
  await deleteObject(key).catch(() => undefined);
  await Promise.all((widths ?? []).map((width) => deleteObject(variantKeyFor(key, width)).catch(() => undefined)));
}

/** Sets (or replaces) one website picture. The browser sends it already shrunk into web sizes. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const slot = String(form.get("slot") ?? "");
  const file = form.get("file");
  if (!isSiteImageSlot(slot)) return Response.json({ error: "Unknown picture." }, { status: 400 });
  if (!(file instanceof File)) return Response.json({ error: "Please choose a picture." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const check = validateImageUpload(contentType, bytes);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  const key = newObjectKey("site", contentType);
  await putObject(key, bytes, contentType);
  const stored = await storeVariantsFromForm(form, "", key);
  const [previous] = await db.select().from(siteImages).where(eq(siteImages.slot, slot)).limit(1);

  const values = {
    r2Key: key,
    altText: String(form.get("altText") ?? "").slice(0, 200),
    contentType,
    byteSize: bytes.byteLength,
    width: Number(form.get("width")) || null,
    height: Number(form.get("height")) || null,
    blurDataUrl: stored.blurDataUrl ?? null,
    variantWidths: stored.widths.length ? stored.widths : null,
    updatedAt: new Date(),
  };
  await db.insert(siteImages).values({ slot, ...values }).onConflictDoUpdate({ target: siteImages.slot, set: values });
  if (previous) await removeStored(previous.r2Key, previous.variantWidths);

  await auditLogEntry({ actorEmail: admin.email, action: "siteimage.set", entityType: "site-image", entityId: slot });
  return Response.json({ ok: true });
}

/** Goes back to the built-in picture. */
export async function DELETE(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const slot = new URL(request.url).searchParams.get("slot") ?? "";
  if (!isSiteImageSlot(slot)) return Response.json({ error: "Unknown picture." }, { status: 400 });
  const [previous] = await db.delete(siteImages).where(eq(siteImages.slot, slot)).returning();
  if (previous) await removeStored(previous.r2Key, previous.variantWidths);
  await auditLogEntry({ actorEmail: admin.email, action: "siteimage.reset", entityType: "site-image", entityId: slot });
  return Response.json({ ok: true });
}
