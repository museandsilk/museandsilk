import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { productVariants } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";
import { runInBackground } from "@/lib/background";
import { checkStockAlerts } from "@/lib/stock-alerts";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  rows: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(80),
        price: z.number().int().min(1).max(10_000_000).nullable().optional(),
        stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
        oldPrice: z.number().int().min(0).max(10_000_000).nullable().optional(),
      }),
    )
    .min(1)
    .max(60),
});

/** Changes price / old price / stock for many sizes at once, matched by product code. One bad row never stops the rest. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "That sheet could not be read. Please use the sheet you downloaded." }, { status: 400 });

  const results: Array<{ sku: string; ok: boolean; changed: boolean; message: string }> = [];
  const touched: string[] = [];
  for (const row of parsed.data.rows) {
    const [current] = await db.select().from(productVariants).where(sql`lower(${productVariants.sku}) = ${row.sku.toLowerCase()}`).limit(1);
    if (!current) {
      results.push({ sku: row.sku, ok: false, changed: false, message: "No product has this code. Check the code, or add the product first." });
      continue;
    }
    const set: Partial<typeof productVariants.$inferInsert> = {};
    if (row.price != null && row.price !== current.price) set.price = row.price;
    if (row.stock != null && row.stock !== current.stockQuantity) set.stockQuantity = row.stock;
    if (row.oldPrice !== undefined) {
      const next = row.oldPrice && row.oldPrice > 0 ? row.oldPrice : null;
      if (next !== current.compareAtPrice) set.compareAtPrice = next;
    }
    const nextPrice = set.price ?? current.price;
    if (set.compareAtPrice != null && set.compareAtPrice <= nextPrice) {
      results.push({ sku: row.sku, ok: false, changed: false, message: "The old price must be higher than the price." });
      continue;
    }
    if (!Object.keys(set).length) {
      results.push({ sku: row.sku, ok: true, changed: false, message: "Already up to date." });
      continue;
    }
    await db.update(productVariants).set({ ...set, updatedAt: new Date() }).where(eq(productVariants.id, current.id));
    touched.push(current.id);
    results.push({ sku: row.sku, ok: true, changed: true, message: "Updated." });
  }
  if (touched.length) {
    runInBackground(checkStockAlerts(touched), "checkStockAlerts");
    await auditLogEntry({ actorEmail: admin.email, action: "stock.import", entityType: "variant", entityId: touched.slice(0, 20).join(","), detail: { updated: touched.length } });
  }
  return Response.json({ results });
}
