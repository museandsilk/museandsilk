import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getAdminUser } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

/** Every active size with its price and stock – the owner edits it in Excel and uploads it back. */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await db.execute(sql`
    select p.name as product, coalesce(v.size, '') as size, v.sku, v.price, v.compare_at_price as "oldPrice", v.stock_quantity as stock
    from product_variants v join products p on p.id = v.product_id
    where v.status = 'active' and p.status <> 'archived'
    order by p.name, v.size`);
  return Response.json({ rows: (result as unknown as { rows: unknown[] }).rows ?? [] });
}
