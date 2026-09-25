import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orderStatusHistory, orders } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";
import { BOOKABLE_STATUSES, bookOrderWithPostex } from "@/lib/postex-booking";
import {
  PostexError,
  cancelPostexOrder,
  getDeliveryCities,
  getPickupAddresses,
  isPostexConfigured,
  suggestCity,
  toPostexPhone,
} from "@/lib/postex";

export const dynamic = "force-dynamic";

const PENDING = "PENDING";

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

function postexFailure(error: unknown) {
  if (error instanceof PostexError) return fail(error.message, 502);
  console.error("PostEx call failed", error);
  return fail("Something went wrong talking to PostEx.", 502);
}

/** State + everything the booking form needs pre-filled. Cheap when already booked (no PostEx
 * calls); when it isn't, it fetches PostEx's delivery cities and pickup addresses. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return fail("Unauthorized", 401);
  const { id } = await context.params;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return fail("Order not found.", 404);

  if (!isPostexConfigured()) return Response.json({ configured: false });

  const booked = order.postexTrackingNumber && order.postexTrackingNumber !== PENDING;
  if (booked) {
    return Response.json({
      configured: true,
      booking: {
        trackingNumber: order.postexTrackingNumber,
        bookedAt: order.postexBookedAt,
        status: order.postexStatus,
        syncedAt: order.postexSyncedAt,
      },
    });
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  const pieces = items.reduce((sum, item) => sum + item.quantity, 0) || 1;

  try {
    const [cities, pickupAddresses] = await Promise.all([getDeliveryCities(), getPickupAddresses()]);
    return Response.json({
      configured: true,
      booking: null,
      canBook: BOOKABLE_STATUSES.includes(order.orderStatus),
      // Why the automatic booking gave up on this order, if it did — shown above the manual form.
      autoError: order.postexAutoError,
      form: {
        cities,
        suggestedCity: suggestCity(order.city, cities),
        // null when the stored number isn't a valid 03… mobile (landline, or an email-only order
        // with no phone at all) — the form then asks the admin to type one.
        phone: toPostexPhone(order.customerPhone),
        invoicePayment: order.paymentStatus === "paid" ? 0 : order.total,
        items: pieces,
        pickupAddresses: pickupAddresses.map((a) => ({
          addressCode: a.addressCode,
          label: `${a.cityName} — ${a.address}`,
        })),
        defaultPickupCode: process.env.POSTEX_PICKUP_ADDRESS_CODE || (pickupAddresses.length === 1 ? pickupAddresses[0].addressCode : null),
      },
    });
  } catch (error) {
    return postexFailure(error);
  }
}

const bookSchema = z.object({
  cityName: z.string().trim().min(1),
  customerPhone: z.string().trim().optional(),
  invoicePayment: z.number().int().min(0),
  items: z.number().int().min(1).max(100),
  pickupAddressCode: z.string().trim().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return fail("Unauthorized", 401);
  if (!isPostexConfigured()) return fail("PostEx isn't configured yet.", 503);
  const { id } = await context.params;

  const parsed = bookSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fail("City, cash-on-delivery amount and piece count are required.", 400);
  const input = parsed.data;

  const result = await bookOrderWithPostex(id, admin.email, {
    cityName: input.cityName,
    // An empty string means "use the number on the order", not "override with nothing".
    customerPhone: input.customerPhone || undefined,
    invoicePayment: input.invoicePayment,
    items: input.items,
    pickupAddressCode: input.pickupAddressCode || undefined,
  });

  if (!result.ok) {
    const status = { not_found: 404, not_bookable: 400, invalid: 400, conflict: 409, postex: 502 }[result.kind];
    return fail(result.message, status);
  }
  return Response.json({ trackingNumber: result.trackingNumber, booked: result.booked }, { status: 201 });
}

/** Cancels the PostEx booking (e.g. the customer changed their mind before pickup). Leaves our own
 * order status alone — moving the order itself is a separate, deliberate step in the order desk. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return fail("Unauthorized", 401);
  if (!isPostexConfigured()) return fail("PostEx isn't configured yet.", 503);
  const { id } = await context.params;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return fail("Order not found.", 404);
  const trackingNumber = order.postexTrackingNumber;
  if (!trackingNumber || trackingNumber === PENDING) return fail("This order has no PostEx booking to cancel.", 400);

  try {
    await cancelPostexOrder(trackingNumber);
  } catch (error) {
    return postexFailure(error);
  }

  // Only cleared after PostEx confirms — if it refuses (already picked up, say) the booking stays
  // recorded here and the admin sees PostEx's own message. postexAutoAttempts is pinned at its cap so
  // the automatic booker doesn't simply re-book an order an admin just deliberately cancelled.
  await db
    .update(orders)
    .set({
      postexTrackingNumber: null,
      postexBookedAt: null,
      postexStatus: null,
      postexSyncedAt: null,
      postexAutoAttempts: 3,
      postexAutoError: "PostEx booking was cancelled by an admin — book it again manually if needed.",
    })
    .where(eq(orders.id, id));
  await db.insert(orderStatusHistory).values({
    orderId: id,
    fromStatus: order.orderStatus,
    toStatus: order.orderStatus,
    note: `PostEx booking ${trackingNumber} cancelled`,
    actorEmail: admin.email,
  });
  await auditLogEntry({
    actorEmail: admin.email,
    action: "order.postex_cancel",
    entityType: "order",
    entityId: id,
    detail: { trackingNumber },
  });

  return Response.json({ ok: true });
}
