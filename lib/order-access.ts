import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { cleanPhone } from "@/lib/slug";
import { toWhatsAppPhone } from "@/lib/whatsapp";

/**
 * Shoppers have no account: knowing the order number AND the phone number used at checkout is what proves
 * an order is theirs (the same check as the tracking page). Phones are compared in canonical digits-only form
 * because checkout accepts "0300…", "+92300…" and "92300…" interchangeably. Returns the order or null – the
 * caller must answer identically for "no such order" and "wrong phone" so order numbers can't be probed.
 */
export async function findOrderForShopper(orderNumber: unknown, phone: unknown) {
  const number = String(orderNumber ?? "").trim().toUpperCase();
  const cleaned = cleanPhone(String(phone ?? ""));
  if (!number || cleaned.replace(/\D/g, "").length < 4) return null;
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, number)).limit(1);
  if (!order || toWhatsAppPhone(order.customerPhone) !== toWhatsAppPhone(cleaned)) return null;
  return order;
}
