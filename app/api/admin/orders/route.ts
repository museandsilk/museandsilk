import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, paymentProofs } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

const VALID_STATUSES = [
  "pending_confirmation",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
];

export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      city: orders.city,
      province: orders.province,
      total: orders.total,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      orderStatus: orders.orderStatus,
      reservationExpiresAt: orders.reservationExpiresAt,
      createdAt: orders.createdAt,
      proofId: paymentProofs.id,
      proofStatus: paymentProofs.status,
    })
    .from(orders)
    .leftJoin(paymentProofs, eq(paymentProofs.orderId, orders.id))
    .where(status && VALID_STATUSES.includes(status) ? and(eq(orders.orderStatus, status)) : undefined)
    .orderBy(desc(orders.createdAt));

  return Response.json({ orders: rows });
}
