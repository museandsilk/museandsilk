import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { fetchTcsLabel, isTcsConfigured } from "@/lib/tcs";

export const dynamic = "force-dynamic";

/** Streams TCS's own shipping label (PDF) for the order's consignment number. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const [order] = await db.select({ cn: orders.courierTrackingNumber }).from(orders).where(eq(orders.id, id)).limit(1);
  if (!order?.cn || order.cn === "PENDING") return Response.json({ error: "This order has no TCS tracking number yet." }, { status: 404 });
  if (!isTcsConfigured()) return Response.json({ error: "TCS is not connected, so the label can't be downloaded here. Print it from the TCS website." }, { status: 400 });
  try {
    const upstream = await fetchTcsLabel(order.cn);
    return new Response(upstream.body, { headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/pdf", "Content-Disposition": `inline; filename="${order.cn}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not get the label." }, { status: 502 });
  }
}
