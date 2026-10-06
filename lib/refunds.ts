// Refund claims: a shopper asks, the owner reviews, optionally arranges a TCS return, and finally marks it
// refunded. One request per order (unique order_id), so double clicks and retries are harmless.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderStatusHistory, orders, refundRequests, siteSettings } from "@/db/schema";
import { auditLogEntry } from "@/lib/admin/audit";
import { announceOrderEvent } from "@/lib/order-events";
import { refundEligibility, type RefundEligibility } from "@/lib/order-rules";
import { notifyAdmins } from "@/lib/push/notify";

export type RefundRow = typeof refundRequests.$inferSelect;

export async function refundWindowDays(): Promise<number> {
  const [row] = await db.select({ days: siteSettings.refundWindowDays }).from(siteSettings).where(eq(siteSettings.id, "store")).limit(1);
  return row?.days ?? 7;
}

/** When the order reached "delivered" (from its history), for the refund window. */
export async function deliveredAt(orderId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | null>`max(${orderStatusHistory.createdAt})` })
    .from(orderStatusHistory)
    .where(and(eq(orderStatusHistory.orderId, orderId), eq(orderStatusHistory.toStatus, "delivered")));
  return row?.at ? new Date(row.at) : null;
}

export async function getRefundForOrder(orderId: string): Promise<RefundRow | null> {
  const [row] = await db.select().from(refundRequests).where(eq(refundRequests.orderId, orderId)).limit(1);
  return row ?? null;
}

export async function checkRefundEligibility(order: { id: string; orderStatus: string }): Promise<RefundEligibility> {
  const [existing, days, at] = await Promise.all([getRefundForOrder(order.id), refundWindowDays(), deliveredAt(order.id)]);
  return refundEligibility({ orderStatus: order.orderStatus, deliveredAt: at }, days, Boolean(existing));
}

/**
 * When money was already received (an approved bank deposit, or cash collected on a delivered order) and
 * the order is cancelled or comes back, the shopper is owed it. Opens a request for the owner so it can
 * never be forgotten. Returns the created row, or null when nothing is owed / one already exists.
 */
export async function createRefundIfPrepaid(orderId: string, kind: "cancelled" | "returned"): Promise<RefundRow | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.paymentStatus !== "paid") return null;
  const [created] = await db
    .insert(refundRequests)
    .values({
      orderId,
      source: "system",
      reason: "order_cancelled",
      details: kind === "cancelled" ? "The order was cancelled after the payment had been received." : "The parcel came back to us after the payment had been received.",
      amount: order.total,
    })
    .onConflictDoNothing()
    .returning();
  if (created) {
    notifyAdmins({ title: "Refund to send", body: `${order.orderNumber} — PKR ${order.total.toLocaleString("en-PK")} was paid and the order is ${kind}.`.slice(0, 200), url: "/admin/refunds", tag: `refund-${order.orderNumber}` });
  }
  return created ?? null;
}

export type CustomerRefundInput = {
  reason: string;
  details: string;
  payoutMethod: string;
  payoutAccount: string;
  payoutTitle: string;
  photoKeys: string[];
};

/** Creates the shopper's claim, or — when the system already opened one — adds their reason and payout details to it. */
export async function submitCustomerRefund(order: { id: string; orderNumber: string; orderStatus: string; total: number }, input: CustomerRefundInput): Promise<{ ok: true; request: RefundRow } | { ok: false; error: string }> {
  const existing = await getRefundForOrder(order.id);
  if (existing) {
    if (existing.status !== "requested" || existing.payoutAccount) return { ok: false, error: "A refund request already exists for this order." };
    // The system opened it (cancelled prepaid order): the shopper only still owes us where to send the money.
    const [updated] = await db
      .update(refundRequests)
      .set({ payoutMethod: input.payoutMethod, payoutAccount: input.payoutAccount, payoutTitle: input.payoutTitle, details: input.details || existing.details, updatedAt: new Date() })
      .where(and(eq(refundRequests.id, existing.id), eq(refundRequests.status, "requested")))
      .returning();
    if (updated) notifyAdmins({ title: "Refund details received", body: `${order.orderNumber} — the customer sent where to pay the refund.`, url: "/admin/refunds", tag: `refund-${order.orderNumber}` });
    return updated ? { ok: true, request: updated } : { ok: false, error: "This refund was just updated – please refresh." };
  }

  const eligibility = await checkRefundEligibility(order);
  if (!eligibility.ok) return { ok: false, error: eligibility.reason };
  const [created] = await db
    .insert(refundRequests)
    .values({
      orderId: order.id,
      source: "customer",
      reason: input.reason,
      details: input.details || null,
      amount: order.total,
      payoutMethod: input.payoutMethod,
      payoutAccount: input.payoutAccount,
      payoutTitle: input.payoutTitle,
      photoKeys: input.photoKeys,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) return { ok: false, error: "A refund request already exists for this order." };
  await db.insert(orderStatusHistory).values({ orderId: order.id, fromStatus: order.orderStatus, toStatus: order.orderStatus, note: "Customer asked for a refund", actorEmail: "customer" });
  notifyAdmins({ title: "Refund request", body: `${order.orderNumber} — PKR ${order.total.toLocaleString("en-PK")}. Please review.`, url: "/admin/refunds", tag: `refund-${order.orderNumber}` });
  return { ok: true, request: created };
}

export type RefundDecision =
  | { action: "approve"; note?: string; amount?: number }
  | { action: "reject"; note: string }
  | { action: "refunded"; amount: number; reference: string; note?: string }
  | { action: "return_tracking"; trackingNumber: string };

/** The owner's decision. Each transition is a guarded UPDATE, so two clicks cannot apply it twice. */
export async function reviewRefund(id: string, admin: string, decision: RefundDecision): Promise<{ ok: true; request: RefundRow } | { ok: false; error: string; status: number }> {
  const [current] = await db.select().from(refundRequests).where(eq(refundRequests.id, id)).limit(1);
  if (!current) return { ok: false, error: "Refund request not found.", status: 404 };
  const now = new Date();

  let from: string[];
  let set: Partial<typeof refundRequests.$inferInsert>;
  let event: "refund_approved" | "refund_declined" | "refunded" | null = null;
  let historyNote: string;

  switch (decision.action) {
    case "approve": {
      from = ["requested"];
      const amount = decision.amount ?? current.amount;
      const [order] = await db.select({ total: orders.total }).from(orders).where(eq(orders.id, current.orderId)).limit(1);
      if (!order || amount < 1 || amount > order.total) return { ok: false, error: `The refund must be between PKR 1 and PKR ${order?.total.toLocaleString("en-PK") ?? "0"}.`, status: 400 };
      set = { status: "approved", amount, adminNote: decision.note?.trim() || null, reviewedBy: admin, reviewedAt: now };
      event = "refund_approved";
      historyNote = `Refund of PKR ${amount.toLocaleString("en-PK")} approved`;
      break;
    }
    case "reject":
      from = ["requested"];
      set = { status: "rejected", adminNote: decision.note.trim(), reviewedBy: admin, reviewedAt: now };
      event = "refund_declined";
      historyNote = "Refund request declined";
      break;
    case "refunded":
      from = ["approved", "requested"];
      set = { status: "refunded", refundedAmount: decision.amount, refundReference: decision.reference.trim(), refundedAt: now, reviewedBy: current.reviewedBy ?? admin, reviewedAt: current.reviewedAt ?? now, ...(decision.note ? { adminNote: decision.note.trim() } : {}) };
      event = "refunded";
      historyNote = `Refund of PKR ${decision.amount.toLocaleString("en-PK")} sent (ref ${decision.reference.trim()})`;
      break;
    case "return_tracking":
      from = ["approved", "requested"];
      set = { returnTrackingNumber: decision.trackingNumber.trim() };
      historyNote = `Return pickup tracking ${decision.trackingNumber.trim()}`;
      break;
  }

  const [row] = await db
    .update(refundRequests)
    .set({ ...set, updatedAt: now })
    .where(and(eq(refundRequests.id, id), sql`${refundRequests.status} in (${sql.join(from.map((s) => sql`${s}`), sql`, `)})`))
    .returning();
  if (!row) return { ok: false, error: "This request was just changed by someone else — please refresh.", status: 409 };

  const [order] = await db.select({ status: orders.orderStatus }).from(orders).where(eq(orders.id, row.orderId)).limit(1);
  await db.insert(orderStatusHistory).values({ orderId: row.orderId, fromStatus: order?.status ?? null, toStatus: order?.status ?? "delivered", note: historyNote, actorEmail: admin });
  if (event) announceOrderEvent(row.orderId, event, "admin");
  await auditLogEntry({ actorEmail: admin, action: `refund.${decision.action}`, entityType: "refund", entityId: id, detail: decision });
  return { ok: true, request: row };
}
