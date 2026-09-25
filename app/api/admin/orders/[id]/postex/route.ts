import { z } from "zod";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orderStatusHistory, orders } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { auditLogEntry } from "@/lib/admin/audit";
import {
  PostexError,
  buildNotes,
  buildOrderDetail,
  cancelPostexOrder,
  createPostexOrder,
  getDeliveryCities,
  getPickupAddresses,
  isPostexConfigured,
  suggestCity,
  toPostexPhone,
} from "@/lib/postex";

export const dynamic = "force-dynamic";

// Only orders the store has actually accepted can go to the courier — never one still awaiting the
// customer's confirmation, and never one already delivered/cancelled/returned.
const BOOKABLE_STATUSES = ["confirmed", "processing", "packed"];
const PENDING = "PENDING";
const STALE_CLAIM_MS = 2 * 60 * 1000;

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
      booking: { trackingNumber: order.postexTrackingNumber, bookedAt: order.postexBookedAt },
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
      form: {
        cities,
        suggestedCity: suggestCity(order.city, cities),
        // null when the stored number isn't a valid 03… mobile (landline, or an email-only order
        // with no phone at all) — the form then asks the admin to type one.
        phone: toPostexPhone(order.customerPhone),
        // Cash to collect at the door: the full total for COD / unverified payment, nothing for an
        // order whose bank-deposit receipt was already approved (paymentStatus "paid").
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

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return fail("Order not found.", 404);
  if (!BOOKABLE_STATUSES.includes(order.orderStatus)) {
    return fail(`An order that is "${order.orderStatus.replaceAll("_", " ")}" can't be booked with a courier. Confirm it first.`, 400);
  }

  const phone = toPostexPhone(input.customerPhone || order.customerPhone);
  if (!phone) return fail("PostEx needs a valid Pakistani mobile number (03xxxxxxxxx) for the customer.", 400);

  // Everything that can be checked without side effects is checked *before* claiming the order, so
  // a rejected request never leaves it half-booked.
  let pickupAddressCode = input.pickupAddressCode || process.env.POSTEX_PICKUP_ADDRESS_CODE || "";
  try {
    const cities = await getDeliveryCities();
    if (!cities.includes(input.cityName)) return fail(`"${input.cityName}" isn't a city PostEx delivers to.`, 400);
    if (!pickupAddressCode) {
      const addresses = await getPickupAddresses();
      if (addresses.length === 1) pickupAddressCode = addresses[0].addressCode;
      else return fail("Choose which pickup address PostEx should collect this parcel from.", 400);
    }
  } catch (error) {
    return postexFailure(error);
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));

  // Claim the order before calling PostEx — same idea as the checkout idempotency key: two clicks
  // (or two admins) can't both pass a read-only "not booked yet" check and each create a parcel.
  // A stale claim (a request that died mid-flight) becomes reclaimable after STALE_CLAIM_MS.
  const now = new Date();
  const claimed = await db
    .update(orders)
    .set({ postexTrackingNumber: PENDING, postexBookedAt: now })
    .where(
      and(
        eq(orders.id, id),
        or(
          isNull(orders.postexTrackingNumber),
          and(eq(orders.postexTrackingNumber, PENDING), lt(orders.postexBookedAt, new Date(now.getTime() - STALE_CLAIM_MS))),
        ),
      ),
    )
    .returning({ id: orders.id });
  if (claimed.length === 0) return fail("This order is already booked with PostEx (or a booking is in progress).", 409);

  let trackingNumber: string;
  try {
    ({ trackingNumber } = await createPostexOrder({
      cityName: input.cityName,
      customerName: order.customerName,
      customerPhone: phone,
      deliveryAddress: order.address,
      invoicePayment: input.invoicePayment,
      items: input.items,
      orderDetail: buildOrderDetail(items),
      orderRefNumber: order.orderNumber,
      transactionNotes: buildNotes(order.orderNumber, order.notes, order.deliveryNotes),
      pickupAddressCode,
    }));
  } catch (error) {
    await db
      .update(orders)
      .set({ postexTrackingNumber: null, postexBookedAt: null })
      .where(and(eq(orders.id, id), eq(orders.postexTrackingNumber, PENDING)));
    return postexFailure(error);
  }

  await db
    .update(orders)
    .set({ postexTrackingNumber: trackingNumber, postexBookedAt: new Date() })
    .where(eq(orders.id, id));

  await db.insert(orderStatusHistory).values({
    orderId: id,
    fromStatus: order.orderStatus,
    toStatus: order.orderStatus,
    note: `Booked with PostEx — tracking ${trackingNumber} (collect PKR ${input.invoicePayment.toLocaleString("en-PK")})`,
    actorEmail: admin.email,
  });
  await auditLogEntry({
    actorEmail: admin.email,
    action: "order.postex_book",
    entityType: "order",
    entityId: id,
    detail: { trackingNumber, cityName: input.cityName, invoicePayment: input.invoicePayment },
  });

  return Response.json({ trackingNumber }, { status: 201 });
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
  // recorded here and the admin sees PostEx's own message.
  await db.update(orders).set({ postexTrackingNumber: null, postexBookedAt: null }).where(eq(orders.id, id));
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
