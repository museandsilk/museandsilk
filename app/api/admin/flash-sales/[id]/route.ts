import { eq } from "drizzle-orm";
import { db } from "@/db";
import { flashSaleProducts, flashSales } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";
import { saleSchema } from "@/lib/flash-sale-schema";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const parsed = saleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid sale." }, { status: 400 });
  const data = parsed.data;

  const [sale] = await db
    .update(flashSales)
    .set({
      name: data.name,
      discountType: data.discountType,
      discountValue: data.discountValue,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      active: data.active,
      appliesToAll: data.appliesToAll,
      updatedAt: new Date(),
    })
    .where(eq(flashSales.id, id))
    .returning();
  if (!sale) return Response.json({ error: "Sale not found." }, { status: 404 });

  await db.delete(flashSaleProducts).where(eq(flashSaleProducts.saleId, id));
  if (!data.appliesToAll && data.productIds.length) {
    await db.insert(flashSaleProducts).values(data.productIds.map((productId) => ({ saleId: id, productId })));
  }
  await auditLogEntry({ actorEmail: admin.email, action: "flash-sale.update", entityType: "flash_sale", entityId: id, detail: { name: data.name } });
  return Response.json({ sale: { ...sale, productIds: data.appliesToAll ? [] : data.productIds } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const [row] = await db.delete(flashSales).where(eq(flashSales.id, id)).returning({ id: flashSales.id });
  if (!row) return Response.json({ error: "Sale not found." }, { status: 404 });
  await auditLogEntry({ actorEmail: admin.email, action: "flash-sale.delete", entityType: "flash_sale", entityId: id });
  return Response.json({ ok: true });
}
