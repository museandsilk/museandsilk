import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { orderIdempotencyKeys, orders } from "@/db/schema";

// If a claimed key still has no order attached after this long, the request that claimed it is
// assumed to have died mid-flight (crashed, killed by the platform) without reaching its own
// cleanup — see reclaimStaleIdempotencyKey.
const STALE_CLAIM_MS = 20_000;

/** Returns the previously-created order for this idempotency key, if one exists yet. Returns null
 * both when the key has never been seen and when it's been claimed but the order it belongs to
 * hasn't been created yet (see claimIdempotencyKey). */
export async function findOrderByIdempotencyKey(key: string) {
  const [existing] = await db
    .select({ order: orders })
    .from(orderIdempotencyKeys)
    .innerJoin(orders, eq(orderIdempotencyKeys.orderId, orders.id))
    .where(eq(orderIdempotencyKeys.key, key))
    .limit(1);
  return existing?.order ?? null;
}

/**
 * Claims an idempotency key *before* any order-creation work starts, closing the race the old
 * "check then act at the end" version had: two requests carrying the same key could both pass a
 * read-only "does an order exist for this yet" check before either had written anything, and both
 * would go on to create a full separate order. The guarded insert here is atomic — only one of two
 * concurrent callers can ever get `true` back — so the loser looks up (or waits briefly for) the
 * winner's order instead of creating its own (see app/api/orders/route.ts).
 *
 * Returns true if this call claimed the key (caller should proceed to create the order, then call
 * attachOrderToIdempotencyKey — or releaseIdempotencyKey if order creation fails). Returns false if
 * the key was already claimed by another request, in-flight or completed.
 */
export async function claimIdempotencyKey(key: string): Promise<boolean> {
  const claimed = await db
    .insert(orderIdempotencyKeys)
    .values({ key })
    .onConflictDoNothing()
    .returning({ key: orderIdempotencyKeys.key });
  return claimed.length > 0;
}

/** Attaches the newly-created order to a key this request claimed. */
export async function attachOrderToIdempotencyKey(key: string, orderId: string): Promise<void> {
  await db.update(orderIdempotencyKeys).set({ orderId }).where(eq(orderIdempotencyKeys.key, key));
}

/** Releases a claimed key that never turned into an order (validation failure, out-of-stock, a
 * write error) so a legitimate retry with the same key — the frontend reuses one key across retries
 * of the same checkout attempt — isn't permanently blocked by its own failed first try. */
export async function releaseIdempotencyKey(key: string): Promise<void> {
  await db.delete(orderIdempotencyKeys).where(eq(orderIdempotencyKeys.key, key));
}

/**
 * Re-claims a key that's been sitting unattached for longer than STALE_CLAIM_MS — the caller that
 * originally claimed it almost certainly crashed before it could either attach an order or release
 * the key on failure. Guarded the same way as every other contested update in this codebase: the
 * WHERE clause only matches a row that's still unattached and still old enough, so two callers
 * racing to reclaim the same stale key can't both succeed. Returns true if this call reclaimed it.
 */
export async function reclaimStaleIdempotencyKey(key: string): Promise<boolean> {
  const reclaimed = await db
    .update(orderIdempotencyKeys)
    .set({ createdAt: new Date() })
    .where(
      and(
        eq(orderIdempotencyKeys.key, key),
        isNull(orderIdempotencyKeys.orderId),
        lt(orderIdempotencyKeys.createdAt, new Date(Date.now() - STALE_CLAIM_MS)),
      ),
    )
    .returning({ key: orderIdempotencyKeys.key });
  return reclaimed.length > 0;
}
