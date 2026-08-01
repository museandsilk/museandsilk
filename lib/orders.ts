import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryMovements, orderItems, orderStatusHistory, orders, productVariants } from "@/db/schema";
import { sendReservationReminderEmail } from "@/lib/email/resend";
import { getPublicSettings } from "@/lib/commerce";

const REMINDER_WINDOW_HOURS = 3;

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

/**
 * Emails a "your order is waiting" nudge for orders still pending_confirmation whose reservation
 * expires within REMINDER_WINDOW_HOURS — the closest fit to a classic "abandoned cart" reminder
 * that this store's data model actually supports: since the cart itself is only ever kept in the
 * customer's browser (see lib/cart.ts) and no email is captured until checkout is submitted, there
 * is nothing to remind before an order exists. Once an order exists we do know their email, and a
 * COD/bank-deposit order sitting unconfirmed near its reservation deadline is the equivalent
 * moment of risk — a nudge here can recover an order that would otherwise auto-cancel.
 *
 * Guarded by reminderSentAt so a run every 15 minutes never emails the same order twice, using the
 * same sequential-writes pattern as expireReservations (see its comment for why).
 */
export async function sendReservationReminders(): Promise<void> {
  const now = new Date();
  const reminderCutoff = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

  const candidates = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      customerEmail: orders.customerEmail,
      total: orders.total,
      currency: orders.currency,
      paymentMethod: orders.paymentMethod,
    })
    .from(orders)
    .where(
      and(
        eq(orders.orderStatus, "pending_confirmation"),
        isNull(orders.reminderSentAt),
        gt(orders.reservationExpiresAt, now),
        lt(orders.reservationExpiresAt, reminderCutoff),
      ),
    )
    .limit(50);

  if (!candidates.length) return;

  const settings = await getPublicSettings();

  for (const order of candidates) {
    if (!order.customerEmail) continue;

    const claimed = await db
      .update(orders)
      .set({ reminderSentAt: now })
      .where(and(eq(orders.id, order.id), isNull(orders.reminderSentAt)))
      .returning({ id: orders.id });
    if (claimed.length === 0) continue; // a concurrent run already claimed this order

    await sendReservationReminderEmail({
      toEmail: order.customerEmail,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: order.total,
      currency: order.currency,
      paymentMethod: order.paymentMethod as "cod" | "bank_deposit",
      whatsappNumber: settings.whatsappNumber || undefined,
    });
  }
}
