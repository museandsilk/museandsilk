import { expect, test, type APIRequestContext } from "@playwright/test";
import { BASE, adminCookie, cleanOrders, mockFcm, mockTcs, orderIdOf, placeOrder, setStock, sql, variantBySku, warmUp } from "../support/helpers";

const SKU = "NA-TE-SAS-M";
const PHONE = "+923001234567";

type Placed = { orderNumber: string; id: string };

/** Places a customer order and (optionally) confirms it as the admin. */
async function newOrder(request: APIRequestContext, options: { confirm?: boolean; payment?: "cod" | "bank_deposit"; quantity?: number } = {}): Promise<Placed> {
  const variant = await setStock(SKU, 30);
  const placed = await placeOrder(request, { items: [{ variantId: variant.id, quantity: options.quantity ?? 1 }], name: "E2E Courier", payment: options.payment, phone: PHONE });
  expect(placed.status, JSON.stringify(placed.body)).toBe(201);
  const orderNumber = String(placed.body.orderNumber);
  const id = await orderIdOf(orderNumber);
  if (options.confirm !== false) {
    const res = await request.post(`${BASE}/api/admin/orders/${id}/status`, { data: { toStatus: "confirmed" } });
    expect(res.status()).toBe(200);
  }
  return { orderNumber, id };
}

const book = (request: APIRequestContext, id: string) => request.post(`${BASE}/api/admin/orders/${id}/courier`, { data: { action: "book" } });
const sync = (request: APIRequestContext, id: string) => request.post(`${BASE}/api/admin/orders/${id}/courier`, { data: { action: "sync" } });
const adminCancel = (request: APIRequestContext, id: string, reason = "customer_asked") => request.post(`${BASE}/api/admin/orders/${id}/cancel`, { data: { reason } });
async function row(id: string) {
  const [r] = await sql`select order_status as "status", payment_status as "payment", courier_tracking_number as "cn", handed_over_at as "handedOverAt", cancel_reason as "cancelReason", cancelled_by as "cancelledBy", total from orders where id = ${id}`;
  return r as { status: string; payment: string; cn: string | null; handedOverAt: string | null; cancelReason: string | null; cancelledBy: string | null; total: number };
}

test.beforeAll(async ({ request }) => {
  await warmUp(request, ["/api/orders/cancel", "/api/orders/refund", "/api/orders/track", "/api/admin/orders/bulk", "/api/admin/search"]);
});
test.beforeEach(async ({ request }) => {
  await cleanOrders();
  await mockTcs.reset();
  await mockFcm.reset();
  await adminCookie(request);
});
test.afterAll(async () => {
  await cleanOrders();
});

test.describe("TCS booking", () => {
  test("booking sends the right parcel to TCS and saves the tracking number", async ({ request }) => {
    const { id, orderNumber } = await newOrder(request, { quantity: 2 });
    const res = await book(request, id);
    expect(res.status(), await res.text()).toBe(200);
    const { trackingNumber } = (await res.json()) as { trackingNumber: string };
    const saved = await row(id);
    expect(saved.cn).toBe(trackingNumber);
    const [booking] = (await mockTcs.state()).bookings;
    expect(booking).toMatchObject({ cn: trackingNumber, referenceno: orderNumber, codamount: saved.total, pieces: 2, mobile: "03001234567", cancelled: false });

    // booking twice is refused – one parcel per order
    expect((await book(request, id)).status()).toBe(409);
    expect((await mockTcs.state()).bookings).toHaveLength(1);
  });

  test("double-clicking Book creates exactly one TCS parcel", async ({ request }) => {
    const { id } = await newOrder(request);
    const results = await Promise.all([book(request, id), book(request, id), book(request, id)]);
    expect(results.filter((r) => r.status() === 200)).toHaveLength(1);
    expect((await mockTcs.state()).bookings).toHaveLength(1);
  });

  test("an unconfirmed order cannot be booked, and a bad phone number explains itself", async ({ request }) => {
    const pending = await newOrder(request, { confirm: false });
    const early = await book(request, pending.id);
    expect(early.status()).toBe(400);
    expect(((await early.json()) as { error: string }).error).toMatch(/confirm it first/i);

    const confirmed = await newOrder(request);
    await sql`update orders set customer_phone = '042-1234567' where id = ${confirmed.id}`;
    const bad = await book(request, confirmed.id);
    expect(bad.status()).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/valid mobile number/i);
    expect((await row(confirmed.id)).cn, "failed booking leaves no half-booked order").toBeNull();
  });

  test("a TCS refusal is shown in plain words and the order stays unbooked", async ({ request }) => {
    const { id } = await newOrder(request);
    await sql`update orders set total = 300000, subtotal = 300000 where id = ${id}`;
    const res = await book(request, id);
    expect(res.status()).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/250,000/);
    expect((await row(id)).cn).toBeNull();
  });

  test("a tracking number typed by hand is saved (for parcels booked on the TCS website)", async ({ request }) => {
    const { id } = await newOrder(request);
    const res = await request.post(`${BASE}/api/admin/orders/${id}/courier`, { data: { action: "manual", trackingNumber: "779412326902" } });
    expect(res.status()).toBe(200);
    expect((await row(id)).cn).toBe("779412326902");
    const bad = await request.post(`${BASE}/api/admin/orders/${id}/courier`, { data: { action: "manual", trackingNumber: "x" } });
    expect(bad.status()).toBe(400);
  });

  test("bulk: confirm several orders, then book them all; one bad order does not stop the rest", async ({ request }) => {
    const a = await newOrder(request, { confirm: false });
    const b = await newOrder(request, { confirm: false });
    const confirm = await request.post(`${BASE}/api/admin/orders/bulk`, { data: { ids: [a.id, b.id], action: "confirm" } });
    expect(((await confirm.json()) as { done: number }).done).toBe(2);
    await sql`update orders set customer_phone = '123' where id = ${b.id}`;
    const booked = (await (await request.post(`${BASE}/api/admin/orders/bulk`, { data: { ids: [a.id, b.id], action: "book_tcs" } })).json()) as { done: number; failed: number; results: Array<{ id: string; ok: boolean; message: string }> };
    expect(booked.done).toBe(1);
    expect(booked.failed).toBe(1);
    expect(booked.results.find((r) => r.id === b.id)?.message).toMatch(/mobile/i);
  });
});

test.describe("cancelling: allowed only until TCS has the parcel", () => {
  test("admin cancels a booked-but-not-collected parcel: TCS booking cancelled, stock released, order closed", async ({ request }) => {
    const { id } = await newOrder(request, { quantity: 2 });
    await book(request, id);
    expect((await variantBySku(SKU)).reserved).toBe(2);
    const res = await adminCancel(request, id, "no_answer");
    expect(res.status(), await res.text()).toBe(200);
    const after = await row(id);
    expect(after).toMatchObject({ status: "cancelled", cn: null, cancelReason: "no_answer" });
    expect((await variantBySku(SKU)).reserved, "reservation released").toBe(0);
    expect((await mockTcs.state()).bookings[0].cancelled, "TCS told to cancel the booking").toBe(true);
  });

  test("once TCS has collected it, cancelling is refused for the admin AND the customer, and stock stays reserved", async ({ request }) => {
    const { id, orderNumber } = await newOrder(request);
    const { trackingNumber } = (await (await book(request, id)).json()) as { trackingNumber: string };
    await mockTcs.setStatus(trackingNumber, "Shipment Picked Up");
    expect((await sync(request, id)).status()).toBe(200);
    const shipped = await row(id);
    expect(shipped.status).toBe("shipped");
    expect(shipped.handedOverAt).not.toBeNull();

    const admin = await adminCancel(request, id);
    expect(admin.status()).toBe(409);
    expect(((await admin.json()) as { error: string }).error).toMatch(/TCS already has this parcel/i);

    const customer = await request.post(`${BASE}/api/orders/cancel`, { data: { orderNumber, phone: PHONE, reason: "changed_mind" } });
    expect(customer.status()).toBe(409);
    expect(((await customer.json()) as { error: string }).error).toMatch(/handed to TCS/i);

    expect((await row(id)).status).toBe("shipped");
    expect((await variantBySku(SKU)).reserved).toBe(1);
  });

  test("marking the parcel collected by hand also closes the door on cancelling", async ({ request }) => {
    const { id } = await newOrder(request);
    expect((await request.post(`${BASE}/api/admin/orders/${id}/status`, { data: { toStatus: "shipped" } })).status()).toBe(200);
    expect((await adminCancel(request, id)).status()).toBe(409);
  });

  test("the customer can cancel before pickup; a wrong phone number gets the same 'not found' as a wrong order", async ({ request }) => {
    const { id, orderNumber } = await newOrder(request, { confirm: false });
    const wrong = await request.post(`${BASE}/api/orders/cancel`, { data: { orderNumber, phone: "+923009999999", reason: "changed_mind" } });
    expect(wrong.status()).toBe(404);
    const missing = await request.post(`${BASE}/api/orders/cancel`, { data: { orderNumber: "NA-000000-000000", phone: PHONE, reason: "changed_mind" } });
    expect(missing.status()).toBe(404);
    expect(await wrong.json()).toEqual(await missing.json());

    const ok = await request.post(`${BASE}/api/orders/cancel`, { data: { orderNumber, phone: "0300 1234567", reason: "ordered_by_mistake" } });
    expect(ok.status(), await ok.text()).toBe(200);
    expect(await row(id)).toMatchObject({ status: "cancelled", cancelledBy: "customer", cancelReason: "ordered_by_mistake" });
    expect((await variantBySku(SKU)).reserved).toBe(0);
    // cancelling again is harmless
    expect((await request.post(`${BASE}/api/orders/cancel`, { data: { orderNumber, phone: PHONE, reason: "changed_mind" } })).status()).toBe(409);
  });

  test("two people cancelling at once release the stock exactly once", async ({ request }) => {
    const { id, orderNumber } = await newOrder(request, { quantity: 3 });
    const results = await Promise.all([adminCancel(request, id), adminCancel(request, id), request.post(`${BASE}/api/orders/cancel`, { data: { orderNumber, phone: PHONE, reason: "changed_mind" } })]);
    expect(results.filter((r) => r.status() === 200)).toHaveLength(1);
    expect((await variantBySku(SKU)).reserved, "never released twice").toBe(0);
  });

  test("race: a cancel and the courier pickup arriving together – exactly one wins and the data stays consistent", async ({ request }) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await mockTcs.reset();
      const { id } = await newOrder(request);
      const { trackingNumber } = (await (await book(request, id)).json()) as { trackingNumber: string };
      await mockTcs.setStatus(trackingNumber, "Shipment Picked Up");
      const [cancelled, synced] = await Promise.all([adminCancel(request, id), sync(request, id)]);
      expect(synced.status()).toBe(200);
      const after = await row(id);
      if (cancelled.status() === 200) {
        expect(after.status).toBe("cancelled");
        expect(after.handedOverAt, "a cancelled order was never handed over").toBeNull();
      } else {
        expect(cancelled.status()).toBe(409);
        expect(after.status).toBe("shipped");
        expect(after.handedOverAt).not.toBeNull();
      }
    }
  });
});

test.describe("delivery and refunds", () => {
  async function delivered(request: APIRequestContext, payment: "cod" | "bank_deposit" = "cod"): Promise<Placed> {
    const order = await newOrder(request, { payment });
    const { trackingNumber } = (await (await book(request, order.id)).json()) as { trackingNumber: string };
    await mockTcs.setStatus(trackingNumber, "Shipment Delivered");
    await sync(request, order.id);
    expect((await row(order.id)).status).toBe("delivered");
    return order;
  }
  const claim = (request: APIRequestContext, orderNumber: string, over: Record<string, string> = {}, photo = false) =>
    request.post(`${BASE}/api/orders/refund`, {
      multipart: {
        orderNumber,
        phone: PHONE,
        reason: "wrong_size",
        details: "Too small",
        payoutMethod: "jazzcash",
        payoutAccount: "03001234567",
        payoutTitle: "Test Shopper",
        ...over,
        ...(photo ? { photos: { name: "p.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex") } } : {}),
      },
    });

  test("TCS says delivered → the order is delivered, cash-on-delivery is marked paid, stock leaves the shelf", async ({ request }) => {
    const before = await setStock(SKU, 30);
    const order = await delivered(request);
    expect((await row(order.id)).payment).toBe("paid");
    const after = await variantBySku(SKU);
    expect(after.reserved).toBe(0);
    expect(after.stock).toBe(before.stock - 1);
  });

  test("full refund journey: customer asks → admin approves → admin marks refunded → customer sees it", async ({ request }) => {
    const order = await delivered(request);
    const bad = await claim(request, order.orderNumber, { payoutAccount: "1" });
    expect(bad.status()).toBe(400);

    const asked = await claim(request, order.orderNumber);
    expect(asked.status(), await asked.text()).toBe(201);
    await mockFcm.waitFor((m) => /refund request/i.test(m.data.title ?? "")).catch(() => undefined);
    expect((await claim(request, order.orderNumber)).status(), "one request per order").toBe(409);

    const track = async () => (await (await request.post(`${BASE}/api/orders/track`, { data: { orderNumber: order.orderNumber, phone: PHONE } })).json()) as { refund: { status: string; reference: string | null } | null; actions: { canRequestRefund: boolean } };
    expect((await track()).refund?.status).toBe("requested");
    expect((await track()).actions.canRequestRefund).toBe(false);

    const [refund] = (await sql`select id from refund_requests where order_id = ${order.id}`) as Array<{ id: string }>;
    const decide = (data: Record<string, unknown>) => request.post(`${BASE}/api/admin/refunds/${refund.id}`, { data });
    expect((await decide({ action: "refunded", amount: 100, reference: "" })).status(), "needs a payment reference").toBe(400);
    expect((await decide({ action: "reject", note: "" })).status(), "a decline needs a reason").toBe(400);
    expect((await decide({ action: "approve", amount: 99_999_999 })).status(), "cannot refund more than was paid").toBe(400);
    const approved = await decide({ action: "approve", note: "Please send it back" });
    expect(approved.status(), await approved.text()).toBe(200);
    expect((await decide({ action: "approve" })).status(), "double click on Approve is refused").toBe(409);
    expect((await track()).refund?.status).toBe("approved");

    const done = await decide({ action: "refunded", amount: 5500, reference: "TID-4893021" });
    expect(done.status()).toBe(200);
    expect((await decide({ action: "refunded", amount: 5500, reference: "TID-4893021" })).status(), "cannot be marked refunded twice").toBe(409);
    const final = await track();
    expect(final.refund).toMatchObject({ status: "refunded", reference: "TID-4893021" });
    const [stored] = (await sql`select refunded_amount as amt, status from refund_requests where id = ${refund.id}`) as Array<{ amt: number; status: string }>;
    expect(stored).toMatchObject({ amt: 5500, status: "refunded" });
  });

  test("photos can be attached, and only real pictures are accepted", async ({ request }) => {
    const order = await delivered(request);
    const fake = await request.post(`${BASE}/api/orders/refund`, {
      multipart: { orderNumber: order.orderNumber, phone: PHONE, reason: "damaged", details: "", payoutMethod: "bank", payoutAccount: "PK36SCBL0000001123456702", payoutTitle: "Test Shopper", photos: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("not an image") } },
    });
    expect(fake.status()).toBe(400);
    const ok = await claim(request, order.orderNumber, { reason: "damaged" }, true);
    expect(ok.status(), await ok.text()).toBe(201);
    const [r] = (await sql`select jsonb_array_length(photo_keys) as n from refund_requests where order_id = ${order.id}`) as Array<{ n: number }>;
    expect(r.n).toBe(1);
  });

  test("refunds are refused before delivery and after the refund window", async ({ request }) => {
    const early = await newOrder(request);
    const tooEarly = await claim(request, early.orderNumber);
    expect(tooEarly.status()).toBe(409);
    expect(((await tooEarly.json()) as { error: string }).error).toMatch(/once your order has been delivered/i);

    const late = await delivered(request);
    await sql`update order_status_history set created_at = now() - interval '20 days' where order_id = ${late.id} and to_status = 'delivered'`;
    const tooLate = await claim(request, late.orderNumber);
    expect(tooLate.status()).toBe(409);
    expect(((await tooLate.json()) as { error: string }).error).toMatch(/refund window/i);

    const wrongPhone = await claim(request, late.orderNumber, { phone: "+923000000000" });
    expect(wrongPhone.status()).toBe(404);
  });

  test("a PAID order that is cancelled opens a refund for the owner automatically; the customer then adds payout details", async ({ request }) => {
    const { id, orderNumber } = await newOrder(request, { payment: "bank_deposit" });
    await sql`update orders set payment_status = 'paid' where id = ${id}`;
    expect((await adminCancel(request, id)).status()).toBe(200);
    const [refund] = (await sql`select source, status, amount, payout_account as acct from refund_requests where order_id = ${id}`) as Array<{ source: string; status: string; amount: number; acct: string | null }>;
    expect(refund).toMatchObject({ source: "system", status: "requested", acct: null });

    const track = (await (await request.post(`${BASE}/api/orders/track`, { data: { orderNumber, phone: PHONE } })).json()) as { refund: { needsPayoutDetails: boolean } };
    expect(track.refund.needsPayoutDetails).toBe(true);
    const add = await claim(request, orderNumber, { reason: "order_cancelled" });
    expect(add.status(), await add.text()).toBe(201);
    const [after] = (await sql`select payout_account as acct, source from refund_requests where order_id = ${id}`) as Array<{ acct: string; source: string }>;
    expect(after.acct).toBe("03001234567");
  });

  test("an unpaid cash-on-delivery order that is cancelled owes nobody anything", async ({ request }) => {
    const { id } = await newOrder(request);
    await adminCancel(request, id);
    expect(await sql`select 1 from refund_requests where order_id = ${id}`).toHaveLength(0);
  });
});

test.describe("admin helpers", () => {
  test("quick search finds orders by number, name and phone digits, and the CSV export is spreadsheet-safe", async ({ request }) => {
    const { orderNumber } = await newOrder(request);
    for (const q of [orderNumber, "E2E Courier", "3001234567"]) {
      const res = await request.get(`${BASE}/api/admin/search?q=${encodeURIComponent(q)}`);
      const { results } = (await res.json()) as { results: Array<{ label: string; group: string }> };
      expect(results.some((r) => r.group === "Orders" && r.label.includes(orderNumber)), q).toBe(true);
    }
    await sql`update orders set customer_name = '=HYPERLINK("http://evil")' where order_number = ${orderNumber}`;
    const csv = await (await request.get(`${BASE}/api/admin/orders/export?days=7`)).text();
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    await sql`update orders set customer_name = 'E2E Courier' where order_number = ${orderNumber}`;
  });

  test("the order list is paged and filterable, and requires a signed-in admin", async ({ request, playwright }) => {
    await newOrder(request, { confirm: false });
    const anon = await playwright.request.newContext();
    expect((await anon.get(`${BASE}/api/admin/orders?tab=all`)).status()).toBe(401);
    expect((await anon.post(`${BASE}/api/admin/orders/bulk`, { data: { ids: [], action: "confirm" } })).status()).toBe(401);
    const list = (await (await request.get(`${BASE}/api/admin/orders?tab=action&pageSize=5`)).json()) as { orders: Array<{ pieces: number; orderStatus: string }>; counts: { action: number } };
    expect(list.counts.action).toBeGreaterThan(0);
    expect(list.orders[0].pieces).toBeGreaterThan(0);
    expect(list.orders.every((o) => o.orderStatus === "pending_confirmation")).toBe(true);
  });

  test("stock sheet import updates only what changed, matches codes case-insensitively and rejects nonsense", async ({ request }) => {
    const before = await variantBySku(SKU);
    const res = await request.post(`${BASE}/api/admin/stock/import`, {
      data: { rows: [{ sku: SKU.toLowerCase(), price: before.price + 100, stock: 44 }, { sku: "NOPE-1", price: 100 }, { sku: SKU, oldPrice: 1 }] },
    });
    const { results } = (await res.json()) as { results: Array<{ ok: boolean; changed: boolean; message: string }> };
    expect(results[0]).toMatchObject({ ok: true, changed: true });
    expect(results[1]).toMatchObject({ ok: false });
    expect(results[2].message).toMatch(/old price must be higher/i);
    const after = await variantBySku(SKU);
    expect(after.price).toBe(before.price + 100);
    expect(after.stock).toBe(44);
    await sql`update product_variants set price = ${before.price}, stock_quantity = ${before.stock} where sku = ${SKU}`;
  });
});
