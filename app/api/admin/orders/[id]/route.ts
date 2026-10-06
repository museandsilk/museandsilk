import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orderStatusHistory, orders, paymentProofs, products } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

  const [items, history, proofs] = await Promise.all([
    // Left join: an order line keeps its own copy of the product name/price, and productId becomes
    // null if the product is later deleted — those lines must still load, just without a link.
    db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        variantId: orderItems.variantId,
        productName: orderItems.productName,
        variantName: orderItems.variantName,
        sku: orderItems.sku,
        unitPrice: orderItems.unitPrice,
        quantity: orderItems.quantity,
        lineTotal: orderItems.lineTotal,
        productSlug: products.slug,
        productStatus: products.status,
      })
      .from(orderItems)
      .leftJoin(products, eq(products.id, orderItems.productId))
      .where(eq(orderItems.orderId, id)),
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)).orderBy(asc(orderStatusHistory.createdAt)),
    db.select().from(paymentProofs).where(eq(paymentProofs.orderId, id)),
  ]);

  return Response.json({ order, items, history, proofs });
}

const patchSchema = z.object({
  customerName: z.string().trim().min(2).max(120).optional(),
  customerPhone: z.string().trim().min(6).max(40).optional(),
  customerEmail: z.string().trim().max(160).nullable().optional(),
  city: z.string().trim().min(2).max(80).optional(),
  province: z.string().trim().min(2).max(60).optional(),
  address: z.string().trim().min(5).max(400).optional(),
  deliveryNotes: z.string().trim().max(500).nullable().optional(),
  /** Private note for the shop – never shown to the customer. */
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** Fix a wrong phone / address, or keep a private note. Allowed until TCS has the parcel. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Please check the details — the name, phone and address must be filled in properly." }, { status: 400 });
  const data = parsed.data;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
  const onlyNote = Object.keys(data).every((key) => key === "notes");
  if (!onlyNote && (order.handedOverAt || ["shipped", "delivered", "cancelled", "returned"].includes(order.orderStatus))) {
    return Response.json({ error: "TCS already has this parcel (or the order is finished), so the delivery details can't be changed any more." }, { status: 409 });
  }

  const [row] = await db.update(orders).set({ ...data, updatedAt: new Date() }).where(eq(orders.id, id)).returning();
  if (!onlyNote) {
    const changed = Object.keys(data).filter((key) => key !== "notes").join(", ");
    await db.insert(orderStatusHistory).values({
      orderId: id,
      fromStatus: order.orderStatus,
      toStatus: order.orderStatus,
      note: `Details corrected (${changed})${order.courierTrackingNumber ? " — the TCS booking was not changed, please update it on the TCS website if needed" : ""}`,
      actorEmail: admin.email,
    });
  }
  await auditLogEntry({ actorEmail: admin.email, action: "order.edit", entityType: "order", entityId: id, detail: data });
  return Response.json({ order: row });
}
