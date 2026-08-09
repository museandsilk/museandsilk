import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderStatusHistory } from "@/db/schema";
import { releaseOrderReservation } from "@/lib/orders";
import { auditLogEntry } from "@/lib/admin/audit";
import { sendWhatsAppText, toWhatsAppPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/** Meta's one-time handshake when the Callback URL is saved in the app dashboard: echoes back
 * hub.challenge only if hub.verify_token matches our own secret, proving to Meta that we control
 * this endpoint (and proving to us that whoever configured the webhook knew our secret). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** True only if the request really came from Meta — checks the X-Hub-Signature-256 header (an
 * HMAC-SHA256 of the raw body, keyed with the Meta app's App Secret) rather than trusting the
 * payload outright. Without this, anyone who found this URL could POST a fake "Confirm" or
 * "Cancel" for any order — this webhook can change real order status and release real stock, so
 * it can't be left open the way a purely informational endpoint could. Fails closed: if
 * WHATSAPP_APP_SECRET isn't set yet, every POST is rejected rather than accepted unverified. */
function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

type WhatsAppButtonMessage = {
  from: string;
  id: string;
  context?: { id?: string };
  type: string;
  button?: { text?: string; payload?: string };
};

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new Response("Forbidden", { status: 403 });
  }

  // Meta expects a fast 200 regardless of what's inside — it retries on non-2xx, and slow/failed
  // acks can get the webhook subscription automatically disabled. Everything below is best-effort:
  // errors are logged, never thrown back to Meta as a failure.
  try {
    const payload = JSON.parse(rawBody) as {
      entry?: Array<{ changes?: Array<{ value?: { messages?: WhatsAppButtonMessage[] } }> }>;
    };
    const messages = payload.entry?.flatMap((entry) => entry.changes?.flatMap((change) => change.value?.messages ?? []) ?? []) ?? [];

    for (const message of messages) {
      if (message.type !== "button" || !message.context?.id || !message.button?.payload) continue;
      await handleButtonReply(message.context.id, message.button.payload);
    }
  } catch (error) {
    console.error("WhatsApp webhook processing failed", error);
  }

  return new Response("OK", { status: 200 });
}

// The order_confirmation template's Quick Reply buttons were created without a custom payload
// field (Meta's basic template editor doesn't expose one), so WhatsApp echoes back the button's
// visible label text as the payload instead of a distinct code. Matched case-insensitively since
// that label is free text, not a stable identifier.
function statusForButtonPayload(buttonPayload: string): "confirmed" | "cancelled" | null {
  const normalized = buttonPayload.trim().toLowerCase();
  if (normalized === "confirm") return "confirmed";
  if (normalized === "cancel") return "cancelled";
  return null;
}

async function handleButtonReply(repliedToMessageId: string, buttonPayload: string): Promise<void> {
  const toStatus = statusForButtonPayload(buttonPayload);
  if (!toStatus) return;

  // Guarded the same way as every other contested order-status write in this codebase: the WHERE
  // only matches an order that's both linked to this exact WhatsApp message AND still
  // pending_confirmation, so a slow/duplicate webhook delivery (Meta does retry) or a tap arriving
  // after the order was already handled some other way can never double-process the same order —
  // the guarded UPDATE simply matches nothing the second time.
  const [order] = await db
    .update(orders)
    .set({ orderStatus: toStatus, updatedAt: new Date() })
    .where(and(eq(orders.whatsappMessageId, repliedToMessageId), eq(orders.orderStatus, "pending_confirmation")))
    .returning();
  if (!order) return;

  await db.insert(orderStatusHistory).values({
    orderId: order.id,
    fromStatus: "pending_confirmation",
    toStatus,
    note: `Customer tapped "${toStatus === "confirmed" ? "Confirm" : "Cancel"}" on WhatsApp`,
    actorEmail: "customer",
  });

  if (toStatus === "cancelled") {
    await releaseOrderReservation(order.id, "Order cancelled by customer via WhatsApp", "customer");
  }

  await auditLogEntry({
    actorEmail: "customer",
    action: "order.whatsapp_reply",
    entityType: "order",
    entityId: order.id,
    detail: { buttonPayload, toStatus },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://museandsilk.com";
  const replyText =
    toStatus === "confirmed"
      ? `Your order #${order.orderNumber} has been confirmed. You can track it on our website: ${siteUrl}/track-order`
      : `Your order #${order.orderNumber} has been cancelled. Feel free to visit again anytime!`;
  const replyResult = await sendWhatsAppText(toWhatsAppPhone(order.customerPhone), replyText);

  // TEMPORARY diagnostic: records exactly what happened when this ran in production, since the
  // reply wasn't arriving and console.error output isn't visible without a live wrangler tail
  // session. Remove once the underlying cause is confirmed and fixed.
  await auditLogEntry({
    actorEmail: "system",
    action: "order.whatsapp_reply_send_result",
    entityType: "order",
    entityId: order.id,
    detail: { ok: replyResult.ok, error: replyResult.error ?? null, toPhone: toWhatsAppPhone(order.customerPhone) },
  });
}
