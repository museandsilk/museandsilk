import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orderStatusHistory, orders, paymentProofs, products } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

  const [items, history, proofs] = await Promise.all([
    // Left join: an order line keeps its own copy of the product name/price, and productId becomes
    // null if the product is later deleted — those lines must still load, just without a link.
    db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        variantId: orderItems.variantId,
        productName: orderItems.productName,
        variantName: orderItems.variantName,
        sku: orderItems.sku,
        unitPrice: orderItems.unitPrice,
        quantity: orderItems.quantity,
        lineTotal: orderItems.lineTotal,
        productSlug: products.slug,
        productStatus: products.status,
      })
      .from(orderItems)
      .leftJoin(products, eq(products.id, orderItems.productId))
      .where(eq(orderItems.orderId, id)),
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)).orderBy(asc(orderStatusHistory.createdAt)),
    db.select().from(paymentProofs).where(eq(paymentProofs.orderId, id)),
  ]);

  return Response.json({ order, items, history, proofs });
}
