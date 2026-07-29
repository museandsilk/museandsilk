import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { productCollections } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ productId: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "productId is required." }, { status: 400 });

  await db
    .insert(productCollections)
    .values({ collectionId: id, productId: parsed.data.productId })
    .onConflictDoNothing();

  await auditLogEntry({
    actorEmail: admin.email,
    action: "collection.product.add",
    entityType: "collection",
    entityId: id,
    detail: parsed.data,
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "productId is required." }, { status: 400 });

  await db
    .delete(productCollections)
    .where(and(eq(productCollections.collectionId, id), eq(productCollections.productId, parsed.data.productId)));

  await auditLogEntry({
    actorEmail: admin.email,
    action: "collection.product.remove",
    entityType: "collection",
    entityId: id,
    detail: parsed.data,
  });

  return Response.json({ ok: true });
}
