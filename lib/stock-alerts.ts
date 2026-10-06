import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { productVariants, products } from "@/db/schema";
import { notifyAdmins } from "@/lib/push/notify";

type StockState = "ok" | "low" | "out";

/**
 * Tells the owner (admin push) when a variant newly runs low or sells out. `stock_alert_state`
 * remembers what was last announced, and the state flip is a guarded UPDATE, so each transition is
 * announced exactly once even when many orders land at the same moment — and a restock quietly
 * re-arms the alert. Safe to call after any stock change; never throws.
 */
export async function checkStockAlerts(variantIds: string[]): Promise<void> {
  try {
    const ids = [...new Set(variantIds)];
    if (!ids.length) return;
    const rows = await db
      .select({
        id: productVariants.id,
        name: productVariants.name,
        sku: productVariants.sku,
        stock: productVariants.stockQuantity,
        reserved: productVariants.reservedQuantity,
        threshold: productVariants.lowStockThreshold,
        state: productVariants.stockAlertState,
        status: productVariants.status,
        productName: products.name,
        productStatus: products.status,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(inArray(productVariants.id, ids));

    for (const row of rows) {
      if (row.status !== "active" || row.productStatus !== "published") continue;
      const available = row.stock - row.reserved;
      const next: StockState = available <= 0 ? "out" : available <= row.threshold ? "low" : "ok";
      if (next === row.state) continue;

      const claimed = await db
        .update(productVariants)
        .set({ stockAlertState: next })
        .where(and(eq(productVariants.id, row.id), eq(productVariants.stockAlertState, row.state)))
        .returning({ id: productVariants.id });
      if (!claimed.length || next === "ok") continue; // someone else announced it, or it was just restocked

      const label = `${row.productName.slice(0, 60)} — ${row.name.slice(0, 40)}`;
      notifyAdmins({
        title: next === "out" ? "Out of stock" : "Low stock",
        body: next === "out" ? `${label} just sold out.` : `${label}: only ${available} left.`,
        url: "/admin/products",
        tag: `stock-${row.id}`,
      });
    }
  } catch (error) {
    console.error("checkStockAlerts failed", error);
  }
}
