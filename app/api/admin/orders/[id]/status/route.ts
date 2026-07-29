import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orderStatusHistory, orders } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

const statusEnum = z.enum([
  "pending_confirmation",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
]);

const bodySchema = z.object({ toStatus: statusEnum, note: z.string().optional() });

// Forward flow plus the two terminal exits allowed from any non-final state.
const FORWARD: Record<string, string[]> = {
  pending_confirmation: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned", "cancelled"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "A valid target status is required." }, { status: 400 });
  const { toStatus, note } = parsed.data;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

  const allowed = FORWARD[order.orderStatus] ?? [];
  if (!allowed.includes(toStatus)) {
    return Response.json(
      { error: `Cannot move an order from "${order.orderStatus}" to "${toStatus}".` },
      { status: 400 },
    );
  }

  const [row] = await db
    .update(orders)
    .set({ orderStatus: toStatus, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();

  await db.insert(orderStatusHistory).values({
    orderId: id,
    fromStatus: order.orderStatus,
    toStatus,
    note: note || null,
    actorEmail: admin.email,
  });

  await auditLogEntry({
    actorEmail: admin.email,
    action: "order.status",
    entityType: "order",
    entityId: id,
    detail: { from: order.orderStatus, to: toStatus, note },
  });

  return Response.json({ order: row });
}
