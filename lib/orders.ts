import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryMovements, orderItems, orderStatusHistory, orders, productVariants } from "@/db/schema";

/**
 * Cancels orders whose stock reservation has expired while still awaiting confirmation, releasing
 * the reserved stock back to the pool. Intended to run before every checkout attempt and from a
 * scheduled cron trigger (see app/api/cron/expire-reservations/route.ts).
 *
 * This project's Neon connection (db/index.ts) uses the stateless `neon-http` driver — a
 * connection-pooling driver caused real production failures on Cloudflare Workers ("Cannot
 * perform I/O on behalf of a different request"), because Workers forbids reusing a persistent
 * connection across different requests. `neon-http` has no `db.transaction()`, so each order here
 * is processed with plain sequential awaits instead, guarded by a conditional UPDATE (cancel only
 * if still "pending_confirmation") so two concurrent runs can never double-cancel or
 * double-release the same order.
 */
export async function expireReservations(): Promise<void> {
  const now = new Date();
  const expired = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(lt(orders.reservationExpiresAt, now), eq(orders.orderStatus, "pending_confirmation")))
    .limit(50);

  for (const order of expired) {
    const cancelled = await db
      .update(orders)
      .set({ orderStatus: "cancelled", updatedAt: now })
      .where(and(eq(orders.id, order.id), eq(orders.orderStatus, "pending_confirmation")))
      .returning({ id: orders.id });
    if (cancelled.length === 0) continue; // a concurrent run already handled this order

    await db.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: "pending_confirmation",
      toStatus: "cancelled",
      note: "Reservation expired automatically",
      actorEmail: "system",
    });

    const items = await db
      .select({ variantId: orderItems.variantId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    for (const item of items) {
      if (!item.variantId) continue;
      await db
        .update(productVariants)
        .set({
          reservedQuantity: sql`greatest(0, ${productVariants.reservedQuantity} - ${item.quantity})`,
          updatedAt: now,
        })
        .where(eq(productVariants.id, item.variantId));

      await db.insert(inventoryMovements).values({
        variantId: item.variantId,
        type: "release",
        quantity: -item.quantity,
        reason: "Reservation expired",
        referenceType: "order",
        referenceId: order.id,
        actorEmail: "system",
      });
    }
  }
}
