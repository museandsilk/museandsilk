import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { PostexError, isPostexConfigured, trackPostexOrder } from "@/lib/postex";

export const dynamic = "force-dynamic";

/** Live parcel status from PostEx — fetched on demand (the admin clicks "Refresh tracking") rather
 * than on a schedule, so it costs nothing while nobody is looking and never adds a background job. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPostexConfigured()) return Response.json({ error: "PostEx isn't configured yet." }, { status: 503 });
  const { id } = await context.params;

  const [order] = await db
    .select({ postexTrackingNumber: orders.postexTrackingNumber })
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
  const trackingNumber = order.postexTrackingNumber;
  if (!trackingNumber || trackingNumber === "PENDING") {
    return Response.json({ error: "This order isn't booked with PostEx." }, { status: 400 });
  }

  try {
    const tracking = await trackPostexOrder(trackingNumber);
    return Response.json({ trackingNumber, ...tracking });
  } catch (error) {
    if (error instanceof PostexError) return Response.json({ error: error.message }, { status: 502 });
    console.error("PostEx tracking failed", error);
    return Response.json({ error: "Something went wrong talking to PostEx." }, { status: 502 });
  }
}
