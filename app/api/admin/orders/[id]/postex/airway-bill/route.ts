import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { PostexError, getAirwayBillPdf, isPostexConfigured } from "@/lib/postex";

export const dynamic = "force-dynamic";

/** Streams the parcel's airway bill (shipping label) PDF through our own admin-authenticated route,
 * so the PostEx token stays server-side — the browser never sees it or calls PostEx directly. */
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
    const pdf = await getAirwayBillPdf(trackingNumber);
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${trackingNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof PostexError) return Response.json({ error: error.message }, { status: 502 });
    console.error("PostEx airway bill failed", error);
    return Response.json({ error: "Something went wrong talking to PostEx." }, { status: 502 });
  }
}
