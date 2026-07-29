import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orderIdempotencyKeys, orders } from "@/db/schema";

/** Returns the previously-created order for this idempotency key, if the same
 * checkout request was already processed (duplicate submission / retry). */
export async function findOrderByIdempotencyKey(key: string) {
  const [existing] = await db
    .select({ order: orders })
    .from(orderIdempotencyKeys)
    .innerJoin(orders, eq(orderIdempotencyKeys.orderId, orders.id))
    .where(eq(orderIdempotencyKeys.key, key))
    .limit(1);
  return existing?.order ?? null;
}

export async function recordIdempotencyKey(key: string, orderId: string) {
  await db.insert(orderIdempotencyKeys).values({ key, orderId }).onConflictDoNothing();
}
