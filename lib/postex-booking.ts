// PostEx booking + status-sync logic shared by the admin order desk (manual buttons) and the
// scheduled job (app/api/cron/postex-sync). Keeping it in one place means an admin click and the
// automation can never disagree about how an order is booked, or about what a courier status means.

import { and, asc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orderStatusHistory, orders } from "@/db/schema";
import { auditLogEntry } from "@/lib/admin/audit";
import { sendAdminAlertEmail } from "@/lib/email/resend";
import { fulfillOrderReservation, releaseOrderReservation } from "@/lib/orders";
import {
  PostexError,
  buildNotes,
  buildOrderDetail,
  createPostexOrder,
  generateLoadSheet,
  getDeliveryCities,
  getPickupAddresses,
  isPostexConfigured,
  isRetryablePostexError,
  orderStatusForPostexStatus,
  suggestCity,
  toPostexPhone,
  trackPostexOrder,
  type CourierOrderStatus,
  type PostexPickupAddress,
} from "@/lib/postex";
import { sendWhatsAppText, toWhatsAppPhone } from "@/lib/whatsapp";

type OrderRow = typeof orders.$inferSelect;

export const BOOKABLE_STATUSES = ["confirmed", "processing", "packed"];
const PENDING = "PENDING";
const STALE_CLAIM_MS = 2 * 60 * 1000;
const MAX_AUTO_ATTEMPTS = 3;
const SYNC_MIN_INTERVAL_MS = 15 * 60 * 1000;
const SYNC_BATCH = 25;

export type BookOverrides = {
  cityName?: string;
  customerPhone?: string;
  invoicePayment?: number;
  items?: number;
  pickupAddressCode?: string;
};

export type BookResult =
  | { ok: true; trackingNumber: string; booked: boolean }
  | { ok: false; kind: "not_found" | "not_bookable" | "invalid" | "conflict" | "postex"; message: string; retryable: boolean };

const fail = (kind: Extract<BookResult, { ok: false }>["kind"], message: string, retryable = false): BookResult => ({ ok: false, kind, message, retryable });

function postexFailure(error: unknown): BookResult {
  if (error instanceof PostexError) return fail("postex", error.message, isRetryablePostexError(error));
  console.error("PostEx call failed", error);
  return fail("postex", "Something went wrong talking to PostEx.", true);
}

/** Which pickup address PostEx should collect from when none was chosen explicitly: the configured
 * code, else the account's only/default one. Null when it's genuinely ambiguous. */
function defaultPickupAddress(addresses: PostexPickupAddress[], explicitCode: string): PostexPickupAddress | null {
  const wanted = explicitCode || process.env.POSTEX_PICKUP_ADDRESS_CODE || "";
  if (wanted) return addresses.find((a) => a.addressCode === wanted) ?? null;
  if (addresses.length === 1) return addresses[0];
  return null;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://nureasmir.com";
}

/**
 * Books one order with PostEx: creates the parcel, then generates its load sheet so it's actually
 * queued for pickup (a created-but-unbooked parcel is never collected). Everything that can be
 * validated without side effects is checked first, so a rejected request never leaves an order
 * half-booked. If the load sheet step fails after the parcel exists, the tracking number is kept
 * (result.booked === false) and the scheduled sync finishes the booking on its next run.
 */
export async function bookOrderWithPostex(orderId: string, actorEmail: string, overrides: BookOverrides = {}): Promise<BookResult> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return fail("not_found", "Order not found.");
  if (!BOOKABLE_STATUSES.includes(order.orderStatus)) {
    return fail("not_bookable", `An order that is "${order.orderStatus.replaceAll("_", " ")}" can't be booked with a courier. Confirm it first.`);
  }

  const phone = toPostexPhone(overrides.customerPhone || order.customerPhone);
  if (!phone) return fail("invalid", "PostEx needs a valid Pakistani mobile number (03xxxxxxxxx) for the customer.");

  let cities: string[];
  let addresses: PostexPickupAddress[];
  try {
    [cities, addresses] = await Promise.all([getDeliveryCities(), getPickupAddresses()]);
  } catch (error) {
    return postexFailure(error);
  }

  const cityName = overrides.cityName || suggestCity(order.city, cities);
  if (!cityName) return fail("invalid", `Couldn't match the customer's city "${order.city}" to a PostEx delivery city — choose one manually.`);
  if (!cities.includes(cityName)) return fail("invalid", `"${cityName}" isn't a city PostEx delivers to.`);

  const pickup = defaultPickupAddress(addresses, overrides.pickupAddressCode ?? "");
  if (!pickup) return fail("invalid", "Choose which pickup address PostEx should collect this parcel from.");

  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const pieces = overrides.items ?? (lines.reduce((sum, line) => sum + line.quantity, 0) || 1);
  // Cash to collect at the door: the full total, except when a bank-deposit receipt was already
  // approved (paymentStatus "paid") — then there's nothing to collect.
  const invoicePayment = overrides.invoicePayment ?? (order.paymentStatus === "paid" ? 0 : order.total);

  // Claim the order before calling PostEx — same idea as the checkout idempotency key: two clicks,
  // two admins, or an admin racing the scheduled job can't all pass a read-only "not booked yet"
  // check and each create a parcel. A stale claim (a request that died mid-flight) is reclaimable.
  const now = new Date();
  const claimed = await db
    .update(orders)
    .set({ postexTrackingNumber: PENDING, postexBookedAt: now })
    .where(
      and(
        eq(orders.id, orderId),
        or(
          isNull(orders.postexTrackingNumber),
          and(eq(orders.postexTrackingNumber, PENDING), lt(orders.postexBookedAt, new Date(now.getTime() - STALE_CLAIM_MS))),
        ),
      ),
    )
    .returning({ id: orders.id });
  if (claimed.length === 0) return fail("conflict", "This order is already booked with PostEx (or a booking is in progress).");

  let trackingNumber: string;
  try {
    ({ trackingNumber } = await createPostexOrder({
      cityName,
      customerName: order.customerName,
      customerPhone: phone,
      deliveryAddress: order.address,
      invoicePayment,
      items: pieces,
      orderDetail: buildOrderDetail(lines),
      orderRefNumber: order.orderNumber,
      transactionNotes: buildNotes(order.orderNumber, order.notes, order.deliveryNotes),
      pickupAddressCode: pickup.addressCode,
    }));
  } catch (error) {
    await db
      .update(orders)
      .set({ postexTrackingNumber: null, postexBookedAt: null })
      .where(and(eq(orders.id, orderId), eq(orders.postexTrackingNumber, PENDING)));
    return postexFailure(error);
  }

  await db
    .update(orders)
    .set({ postexTrackingNumber: trackingNumber, postexBookedAt: new Date(), postexStatus: "Unbooked", postexSyncedAt: new Date(), postexAutoError: null })
    .where(eq(orders.id, orderId));

  let booked = false;
  try {
    await generateLoadSheet([trackingNumber], pickup.address);
    booked = true;
    await db.update(orders).set({ postexStatus: "Booked", postexSyncedAt: new Date() }).where(eq(orders.id, orderId));
  } catch (error) {
    console.error("PostEx load sheet failed — the scheduled sync will retry", trackingNumber, error);
  }

  await db.insert(orderStatusHistory).values({
    orderId,
    fromStatus: order.orderStatus,
    toStatus: order.orderStatus,
    note: booked
      ? `Booked with PostEx — tracking ${trackingNumber} (collect PKR ${invoicePayment.toLocaleString("en-PK")})`
      : `Created at PostEx — tracking ${trackingNumber}; pickup booking will complete automatically`,
    actorEmail,
  });
  await auditLogEntry({
    actorEmail,
    action: "order.postex_book",
    entityType: "order",
    entityId: orderId,
    detail: { trackingNumber, cityName, invoicePayment, booked },
  });

  // Tell the customer, on the WhatsApp number they gave us. Only for the number already on the
  // order (not an admin-typed override the customer never messaged us from), and best-effort: free-text
  // WhatsApp only delivers inside the 24h window after the customer's own Confirm tap, so a late
  // manual booking may not go through — that never affects the booking itself.
  if (!overrides.customerPhone && toPostexPhone(order.customerPhone)) {
    await sendWhatsAppText(
      toWhatsAppPhone(order.customerPhone),
      `Your order #${order.orderNumber} has been handed to our courier, PostEx.\nTracking number: ${trackingNumber}\nTrack it any time: ${siteUrl()}/track-order`,
    );
  }

  return { ok: true, trackingNumber, booked };
}

/** Second half of a booking that got created but not queued for pickup (status still "Unbooked"):
 * generates the load sheet. Returns whether it succeeded. */
async function finalizeUnbookedParcel(order: OrderRow): Promise<boolean> {
  const trackingNumber = order.postexTrackingNumber;
  if (!trackingNumber || trackingNumber === PENDING) return false;
  try {
    const addresses = await getPickupAddresses();
    const pickup = defaultPickupAddress(addresses, "") ?? addresses.find((a) => a.addressType === "Default Address") ?? addresses[0];
    await generateLoadSheet([trackingNumber], pickup?.address);
    await db.update(orders).set({ postexStatus: "Booked", postexSyncedAt: new Date() }).where(eq(orders.id, order.id));
    await db.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: order.orderStatus,
      toStatus: order.orderStatus,
      note: `PostEx pickup booking completed — tracking ${trackingNumber}`,
      actorEmail: "system",
    });
    return true;
  } catch (error) {
    console.error("PostEx load sheet retry failed", trackingNumber, error);
    return false;
  }
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The moment from which customer-confirmed orders are booked automatically. Unset/invalid means
 * automatic booking is OFF. Doubling as the safety cutoff: orders confirmed before it (including any
 * already handled by hand or through the PostEx portal) are never touched retroactively. */
export function postexAutoBookSince(): Date | null {
  const raw = process.env.POSTEX_AUTO_BOOK_FROM;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type AutoBookSummary = {
  enabled: boolean;
  candidates: string[]; // order numbers
  booked: number;
  failed: number;
};

/**
 * Books, with no admin involved, every order the *customer* has confirmed (their WhatsApp Confirm
 * tap) and every order an admin placed on a customer's behalf, since automatic booking was switched
 * on. Orders an admin confirmed by hand stay manual, and so do email-only orders (PostEx requires a
 * phone number, so those need a human to add one).
 *
 * Transient failures (PostEx down/timeout) are retried on later runs, up to MAX_AUTO_ATTEMPTS.
 * Permanent ones (unrecognised city, invalid phone) aren't retried; the reason is stored on the order
 * for the admin drawer and emailed to the owner once, instead of anyone having to go looking.
 */
export async function autoBookConfirmedOrders(dryRun = false): Promise<AutoBookSummary> {
  const since = postexAutoBookSince();
  if (!since) return { enabled: false, candidates: [], booked: 0, failed: 0 };

  const rows = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, attempts: orders.postexAutoAttempts })
    .from(orders)
    .where(
      and(
        eq(orders.orderStatus, "confirmed"),
        isNull(orders.postexTrackingNumber),
        lt(orders.postexAutoAttempts, MAX_AUTO_ATTEMPTS),
        sql`exists (
          select 1 from order_status_history h
          where h.order_id = ${orders.id}
            and h.to_status = 'confirmed'
            -- either the customer's own Confirm tap, or an order an admin placed on their behalf
            -- (lib/admin-order-placement.ts writes it straight to confirmed: from_status is null).
            -- An admin confirming a pending order by hand has from_status 'pending_confirmation'
            -- and stays manual.
            and (h.actor_email = 'customer' or h.from_status is null)
            and h.created_at >= ${since.toISOString()}::timestamptz
        )`,
      ),
    )
    .orderBy(asc(orders.createdAt))
    .limit(10);

  const summary: AutoBookSummary = { enabled: true, candidates: rows.map((row) => row.orderNumber), booked: 0, failed: 0 };
  if (dryRun) return summary;

  for (const row of rows) {
    const outcome = await autoBookOne(row);
    if (outcome.result.ok) summary.booked++;
    else if (outcome.counted) summary.failed++;
  }
  return summary;
}

/** Books one order automatically and does the failure bookkeeping shared by the scheduled sweeper and
 * the immediate booking right after an admin places an order: transient failures count an attempt (the
 * sweeper retries up to MAX_AUTO_ATTEMPTS), permanent ones stop retrying; either way the reason is
 * stored on the order and, once we give up, written to its history and emailed to the owner. */
async function autoBookOne(row: { id: string; orderNumber: string; attempts: number }): Promise<{ result: BookResult; counted: boolean }> {
  const result = await bookOrderWithPostex(row.id, "system");
  if (result.ok) return { result, counted: false };
  // Someone else (an admin click, another run) got there first, or the order moved on — not a failure.
  if (result.kind === "conflict" || result.kind === "not_bookable" || result.kind === "not_found") return { result, counted: false };

  const attempts = row.attempts + 1;
  const gaveUp = !result.retryable || attempts >= MAX_AUTO_ATTEMPTS;
  await db
    .update(orders)
    .set({ postexAutoAttempts: gaveUp ? MAX_AUTO_ATTEMPTS : attempts, postexAutoError: result.message })
    .where(eq(orders.id, row.id));
  if (gaveUp) {
    await db.insert(orderStatusHistory).values({
      orderId: row.id,
      fromStatus: "confirmed",
      toStatus: "confirmed",
      note: `Automatic PostEx booking failed: ${result.message} — please book it manually.`,
      actorEmail: "system",
    });
    await sendAdminAlertEmail(
      `Order ${row.orderNumber} needs a manual PostEx booking`,
      `<p>Order <strong>${escapeHtml(row.orderNumber)}</strong> is confirmed, but couldn't be booked with PostEx automatically:</p><p>${escapeHtml(result.message)}</p><p>Open the order in the admin order desk and use “Book with PostEx” to fix the details and book it.</p>`,
    );
  }
  return { result, counted: true };
}

export type CourierOutcome =
  | { state: "booked"; trackingNumber: string }
  | { state: "created"; trackingNumber: string }
  | { state: "failed"; message: string; willRetry: boolean }
  | { state: "skipped" };

/**
 * Immediately books an order an admin has just placed (already confirmed), exactly as the sweeper
 * would for a customer-confirmed one — so the admin doesn't wait for the next scheduled run. Only
 * acts when courier booking is configured AND automatic booking is switched on. Never throws: the
 * order is already saved, so a PostEx problem is reported back (and retried by the sweeper), not raised.
 */
export async function autoBookJustPlacedOrder(orderId: string): Promise<CourierOutcome> {
  if (!isPostexConfigured() || !postexAutoBookSince()) return { state: "skipped" };
  try {
    const [row] = await db.select({ id: orders.id, orderNumber: orders.orderNumber, attempts: orders.postexAutoAttempts }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!row) return { state: "skipped" };
    const { result } = await autoBookOne(row);
    if (result.ok) return { state: result.booked ? "booked" : "created", trackingNumber: result.trackingNumber };
    if (result.kind === "conflict") return { state: "skipped" };
    return { state: "failed", message: result.message, willRetry: result.retryable && row.attempts + 1 < MAX_AUTO_ATTEMPTS };
  } catch (error) {
    console.error("Immediate PostEx booking failed for", orderId, error);
    return { state: "failed", message: "Couldn't reach PostEx just now.", willRetry: true };
  }
}

/** Moves an order forward because the courier says so (picked up / delivered / returned), with the
 * same stock side effects as an admin doing it by hand in the order desk. Forward-only and guarded
 * on the status we read, so it can never undo or race an admin's own change. */
export async function applyCourierTransition(order: OrderRow, target: CourierOrderStatus, postexStatus: string | null): Promise<boolean> {
  const allowedFrom = target === "shipped" ? ["confirmed", "processing", "packed"] : ["confirmed", "processing", "packed", "shipped"];
  if (!allowedFrom.includes(order.orderStatus)) return false;

  const [moved] = await db
    .update(orders)
    .set({ orderStatus: target, updatedAt: new Date() })
    .where(and(eq(orders.id, order.id), eq(orders.orderStatus, order.orderStatus)))
    .returning({ id: orders.id });
  if (!moved) return false;

  await db.insert(orderStatusHistory).values({
    orderId: order.id,
    fromStatus: order.orderStatus,
    toStatus: target,
    note: `PostEx: ${postexStatus ?? target}`,
    actorEmail: "system",
  });
  // Mirrors app/api/admin/orders/[id]/status/route.ts: delivery is the one point stock permanently
  // leaves the shelf; a return before delivery just frees the reservation.
  if (target === "delivered") await fulfillOrderReservation(order.id, "system");
  else if (target === "returned") await releaseOrderReservation(order.id, "Order returned by courier (PostEx)", "system");

  await auditLogEntry({
    actorEmail: "system",
    action: "order.postex_sync",
    entityType: "order",
    entityId: order.id,
    detail: { from: order.orderStatus, to: target, postexStatus },
  });
  return true;
}

export type SyncSummary = { checked: number; updated: number; moved: number; finalized: number; failed: number };

/**
 * Refreshes each booked parcel's status from PostEx and, where it means something for the order
 * (courier has it / delivered / returned), advances the order. Also finishes any booking still stuck
 * at "Unbooked". Per-order throttled (SYNC_MIN_INTERVAL_MS) unless `force` or a specific `orderId`
 * is given, so the 5-minute job stays cheap and a manual click always gets a fresh answer.
 */
export async function syncPostexStatuses(options: { orderId?: string; force?: boolean } = {}): Promise<SyncSummary> {
  const staleBefore = new Date(Date.now() - SYNC_MIN_INTERVAL_MS);
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        inArray(orders.orderStatus, ["confirmed", "processing", "packed", "shipped"]),
        ne(orders.postexTrackingNumber, PENDING),
        sql`${orders.postexTrackingNumber} is not null`,
        options.orderId
          ? eq(orders.id, options.orderId)
          : options.force
            ? undefined
            : or(isNull(orders.postexSyncedAt), lt(orders.postexSyncedAt, staleBefore)),
      ),
    )
    .orderBy(sql`${orders.postexSyncedAt} asc nulls first`)
    .limit(SYNC_BATCH);

  const summary: SyncSummary = { checked: rows.length, updated: 0, moved: 0, finalized: 0, failed: 0 };
  for (const row of rows) {
    try {
      const { transactionStatus } = await trackPostexOrder(row.postexTrackingNumber as string);
      await db.update(orders).set({ postexStatus: transactionStatus, postexSyncedAt: new Date() }).where(eq(orders.id, row.id));
      summary.updated++;

      if ((transactionStatus ?? "").toLowerCase() === "unbooked" && row.orderStatus !== "shipped" && (await finalizeUnbookedParcel(row))) {
        summary.finalized++;
      }
      const target = orderStatusForPostexStatus(transactionStatus);
      if (target && (await applyCourierTransition(row, target, transactionStatus))) summary.moved++;
    } catch (error) {
      summary.failed++;
      console.error("PostEx sync failed for", row.orderNumber, error);
    }
  }
  return summary;
}
