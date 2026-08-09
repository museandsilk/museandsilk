import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orderStatusHistory, orders } from "@/db/schema";
import { cleanPhone } from "@/lib/slug";
import { toWhatsAppPhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { orderNumber?: string; phone?: string };
  try {
    body = (await request.json()) as { orderNumber?: string; phone?: string };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const orderNumber = String(body.orderNumber ?? "").trim().toUpperCase();
  const phone = cleanPhone(String(body.phone ?? ""));
  if (!orderNumber || phone.replace(/\D/g, "").length < 4) {
    return Response.json({ error: "Enter the order number and phone." }, { status: 400 });
  }

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      city: orders.city,
      province: orders.province,
      subtotal: orders.subtotal,
      deliveryCharge: orders.deliveryCharge,
      total: orders.total,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      orderStatus: orders.orderStatus,
      reservationExpiresAt: orders.reservationExpiresAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  // Don't leak whether the order number exists to a phone number that doesn't match it: always
  // return the same 404 whether the order is missing or the phone simply doesn't match.
  //
  // Compared via toWhatsAppPhone's canonical digits-only form rather than raw string equality —
  // checkout accepts free-text phone entry ("0300...", "+92300...", "92300..."), and a customer
  // isn't guaranteed to type it the same way twice. A raw-string match would silently fail to find
  // a real order any time the two entries used different (but equivalent) formats.
  if (!order || toWhatsAppPhone(order.customerPhone) !== toWhatsAppPhone(phone)) {
    return Response.json({ error: "No matching order was found." }, { status: 404 });
  }

  const [items, history] = await Promise.all([
    db
      .select({
        productName: orderItems.productName,
        variantName: orderItems.variantName,
        sku: orderItems.sku,
        unitPrice: orderItems.unitPrice,
        quantity: orderItems.quantity,
        lineTotal: orderItems.lineTotal,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id)),
    db
      .select({
        status: orderStatusHistory.toStatus,
        note: orderStatusHistory.note,
        createdAt: orderStatusHistory.createdAt,
      })
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(desc(orderStatusHistory.createdAt)),
  ]);

  return Response.json({
    order: {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      city: order.city,
      province: order.province,
      subtotal: order.subtotal,
      deliveryCharge: order.deliveryCharge,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      reservationExpiresAt: order.reservationExpiresAt ? order.reservationExpiresAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
    },
    items,
    history: history.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
  });
}
