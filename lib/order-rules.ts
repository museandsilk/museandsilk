// Plain-language order vocabulary and the business rules about what may happen to an order when.
// Pure (no database, no network) so the admin screens, the customer tracking page and the API routes
// all agree — and so it can be unit-tested.

export const ORDER_STATUSES = ["pending_confirmation", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled", "returned"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Tone = "new" | "work" | "ship" | "done" | "bad" | "muted";

/** What the owner sees. Words a shop owner uses, not database words. */
export const STATUS_INFO: Record<string, { label: string; short: string; tone: Tone; help: string }> = {
  pending_confirmation: { label: "New — please confirm", short: "New", tone: "new", help: "The customer has placed this order. Call or WhatsApp them to confirm, then press Confirm." },
  confirmed: { label: "Confirmed", short: "Confirmed", tone: "work", help: "The customer has agreed. Next: pack it." },
  processing: { label: "Being packed", short: "Packing", tone: "work", help: "You are getting this order ready." },
  packed: { label: "Packed — ready for TCS", short: "Ready for TCS", tone: "work", help: "Packed and waiting for TCS to collect it. You can still cancel until TCS takes it." },
  shipped: { label: "With TCS", short: "With TCS", tone: "ship", help: "TCS has the parcel and is delivering it. It can no longer be cancelled." },
  delivered: { label: "Delivered", short: "Delivered", tone: "done", help: "The customer has received the parcel." },
  cancelled: { label: "Cancelled", short: "Cancelled", tone: "bad", help: "This order was cancelled. The stock has gone back to the shelf." },
  returned: { label: "Returned", short: "Returned", tone: "bad", help: "The parcel came back. The stock has gone back to the shelf." },
};

export function statusLabel(status: string): string {
  return STATUS_INFO[status]?.label ?? status.replaceAll("_", " ");
}

/** Statuses in which TCS has not yet taken the parcel – the only time an order may be cancelled. */
export const CANCELLABLE_STATUSES = ["pending_confirmation", "confirmed", "processing", "packed"] as const;

export type CancellableOrder = { orderStatus: string; handedOverAt?: Date | string | null };

/** Why this order can NOT be cancelled right now (a sentence for the screen), or null when it can. */
export function cancelBlockReason(order: CancellableOrder, viewer: "admin" | "customer" = "admin"): string | null {
  if (order.orderStatus === "cancelled") return "This order is already cancelled.";
  if (order.orderStatus === "returned") return "This order has already come back to us.";
  if (order.orderStatus === "delivered") {
    return viewer === "customer"
      ? "This order has been delivered, so it can't be cancelled. You can ask for a refund instead."
      : "This order is already delivered, so it can't be cancelled. If the customer is unhappy, use Refund.";
  }
  if (order.orderStatus === "shipped" || order.handedOverAt) {
    return viewer === "customer"
      ? "Your parcel has already been handed to TCS, so it can't be cancelled any more. If you don't want it, you can refuse it at the door and it will come back to us."
      : "TCS already has this parcel, so it can no longer be cancelled. If the customer refuses it, it will come back as a return.";
  }
  return null;
}

export function canCancel(order: CancellableOrder): boolean {
  return cancelBlockReason(order) === null;
}

export const ADMIN_CANCEL_REASONS = [
  { value: "customer_asked", label: "Customer asked to cancel" },
  { value: "no_answer", label: "Customer did not answer the phone" },
  { value: "out_of_stock", label: "Item is out of stock" },
  { value: "wrong_details", label: "Address or phone number is wrong" },
  { value: "duplicate", label: "Customer ordered twice" },
  { value: "other", label: "Another reason" },
] as const;

export const CUSTOMER_CANCEL_REASONS = [
  { value: "changed_mind", label: "I changed my mind" },
  { value: "ordered_by_mistake", label: "I ordered by mistake" },
  { value: "wrong_size_or_item", label: "I chose the wrong size or item" },
  { value: "found_cheaper", label: "I found it cheaper elsewhere" },
  { value: "too_slow", label: "Delivery will take too long" },
  { value: "other", label: "Another reason" },
] as const;

export function cancelReasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  return [...ADMIN_CANCEL_REASONS, ...CUSTOMER_CANCEL_REASONS].find((reason) => reason.value === code)?.label ?? code;
}

// ---------------------------------------------------------------------------------------------
// What a TCS tracking status means for the order
// ---------------------------------------------------------------------------------------------

export type CourierStage = "booked" | "handed_over" | "out_for_delivery" | "delivered" | "returned" | "failed_attempt";

/**
 * Maps TCS's free-text tracking status ("Shipment Picked Up", "Arrived at TCS Facility", "Out For
 * Delivery", "Shipment Delivered", "Return to Shipper" …) to a stage. Anything unrecognised returns null
 * and is simply displayed as text – it never moves an order by itself.
 */
export function courierStage(statusText: string | null | undefined): CourierStage | null {
  const text = (statusText ?? "").trim().toLowerCase();
  if (!text) return null;
  if (/return(ed)?\b.*(shipper|origin|sender)|shipment returned|\brto\b|returned to/.test(text)) return "returned";
  if (/out for delivery/.test(text)) return "out_for_delivery";
  if (/(attempt|undeliver|not delivered|refused|consignee not available|address not found)/.test(text)) return "failed_attempt";
  if (/deliver/.test(text)) return "delivered";
  if (/(picked up|pick-?up done|collected|arrived|received at|departed|in transit|dispatched|at tcs|forwarded|connection)/.test(text)) return "handed_over";
  if (/(book|created|pending|cn generated|requested)/.test(text)) return "booked";
  return null;
}

/** What a shopper reads on the tracking page for a given TCS status. */
export function customerFacingCourierStatus(statusText: string | null | undefined): string {
  switch (courierStage(statusText)) {
    case "delivered":
      return "Delivered";
    case "out_for_delivery":
      return "Out for delivery today";
    case "handed_over":
      return "On its way";
    case "failed_attempt":
      return "Delivery attempted — TCS will try again";
    case "returned":
      return "Returning to us";
    case "booked":
      return "Waiting for TCS to collect";
    default:
      return statusText ? statusText : "";
  }
}

// ---------------------------------------------------------------------------------------------
// Refund vocabulary
// ---------------------------------------------------------------------------------------------

export const REFUND_REASONS = [
  { value: "damaged", label: "The item arrived damaged" },
  { value: "wrong_item", label: "I received the wrong item" },
  { value: "wrong_size", label: "The size does not fit" },
  { value: "not_as_described", label: "It is not as shown on the website" },
  { value: "quality", label: "I am not happy with the quality" },
  { value: "changed_mind", label: "I changed my mind" },
  { value: "order_cancelled", label: "Order cancelled after payment" },
  { value: "other", label: "Another reason" },
] as const;

export function refundReasonLabel(code: string): string {
  return REFUND_REASONS.find((reason) => reason.value === code)?.label ?? code;
}

export const PAYOUT_METHODS = [
  { value: "bank", label: "Bank account" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "nayapay", label: "NayaPay" },
  { value: "other", label: "Other" },
] as const;

export const REFUND_STATUS_INFO: Record<string, { label: string; tone: Tone; help: string }> = {
  requested: { label: "Waiting for your decision", tone: "new", help: "The customer is asking for money back. Read the reason, then approve or decline." },
  approved: { label: "Approved — send the money", tone: "work", help: "You agreed. If the item must come back, book a TCS return pickup. Then pay the customer and press Mark as refunded." },
  refunded: { label: "Refunded", tone: "done", help: "The money has been sent to the customer." },
  rejected: { label: "Declined", tone: "bad", help: "You declined this request. The customer has been told." },
};

/** Days between two dates, rounded down – used for the refund window. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export type RefundEligibility = { ok: true } | { ok: false; reason: string };

/** Can this shopper ask for a refund right now? Delivered orders, inside the refund window, once. */
export function refundEligibility(order: { orderStatus: string; deliveredAt: Date | null }, windowDays: number, hasRequest: boolean, now: Date = new Date()): RefundEligibility {
  if (hasRequest) return { ok: false, reason: "A refund request already exists for this order." };
  if (order.orderStatus !== "delivered") {
    return { ok: false, reason: "You can ask for a refund once your order has been delivered." };
  }
  if (!order.deliveredAt) return { ok: true };
  if (daysBetween(order.deliveredAt, now) > windowDays) {
    return { ok: false, reason: `The ${windowDays}-day refund window for this order has passed. Please contact us on WhatsApp.` };
  }
  return { ok: true };
}
