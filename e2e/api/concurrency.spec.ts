import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { BASE, CRON_SECRET, adminCookie, cleanOrders, orderRows, placeOrder, setStock, sql, variantBySku, warmUp } from "../support/helpers";

// The pants have 4 sizes; each test owns one SKU so state never leaks between tests.
const LAST_PIECE = "NA-PA-CAR-32";
const OTHER = "NA-PA-CAR-34";
const SHIRT = "NA-TE-SAS-M";

test.beforeAll(async ({ request }) => {
  await warmUp(request, ["/api/cron/expire-reservations", "/api/cron/sales", "/api/admin/orders/x/status"]);
});
test.beforeEach(async () => {
  await cleanOrders();
});
test.afterAll(async () => {
  await cleanOrders();
});

test.describe("last piece, many buyers", () => {
  test("8 simultaneous customers, 1 unit left → exactly one order succeeds, nothing is oversold", async ({ request }) => {
    const variant = await setStock(LAST_PIECE, 1);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => placeOrder(request, { items: [{ variantId: variant.id, quantity: 1 }] })),
    );
    const created = results.filter((r) => r.status === 201);
    const refused = results.filter((r) => r.status === 409);
    expect(created, JSON.stringify(results.map((r) => r.status))).toHaveLength(1);
    expect(refused).toHaveLength(7);
    for (const r of refused) expect(String(r.body.error)).toMatch(/enough available stock/i);

    const after = await variantBySku(LAST_PIECE);
    expect(after.reserved, "reserved never exceeds stock").toBe(1);
    expect(after.stock - after.reserved).toBe(0);
    expect(await orderRows()).toHaveLength(1);
  });

  test("qty 2 requested with only 1 left is refused without reserving anything", async ({ request }) => {
    const variant = await setStock(LAST_PIECE, 1);
    const res = await placeOrder(request, { items: [{ variantId: variant.id, quantity: 2 }] });
    expect(res.status).toBe(409);
    expect((await variantBySku(LAST_PIECE)).reserved).toBe(0);
  });

  test("a multi-item order where the 2nd item is gone rolls the 1st item's reservation back", async ({ request }) => {
    const plenty = await setStock(OTHER, 10);
    const none = await setStock(LAST_PIECE, 0);
    const res = await placeOrder(request, {
      items: [
        { variantId: plenty.id, quantity: 2 },
        { variantId: none.id, quantity: 1 },
      ],
    });
    expect(res.status).toBe(409);
    expect((await variantBySku(OTHER)).reserved, "first line must be released").toBe(0);
    expect(await orderRows()).toHaveLength(0);
  });

  test("two carts competing for overlapping stock: never more reserved than exists", async ({ request }) => {
    const a = await setStock(SHIRT, 5);
    const results = await Promise.all(Array.from({ length: 6 }, () => placeOrder(request, { items: [{ variantId: a.id, quantity: 2 }] })));
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(2); // 2 × 2 = 4 of 5; the 3rd would need 6
    const after = await variantBySku(SHIRT);
    expect(after.reserved).toBe(4);
    expect(after.reserved).toBeLessThanOrEqual(after.stock);
  });
});

test.describe("double submits and retries", () => {
  test("same Idempotency-Key sent 6× at once creates one order and returns the same order number", async ({ request }) => {
    const variant = await setStock(SHIRT, 10);
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => placeOrder(request, { items: [{ variantId: variant.id, quantity: 1 }], key })),
    );
    expect(results.every((r) => r.status === 201 || r.status === 200)).toBe(true);
    const numbers = new Set(results.map((r) => r.body.orderNumber));
    expect(numbers.size).toBe(1);
    expect(await orderRows()).toHaveLength(1);
    expect((await variantBySku(SHIRT)).reserved).toBe(1);
  });

  test("retrying after the reply was lost (same key, later) returns the original order", async ({ request }) => {
    const variant = await setStock(SHIRT, 10);
    const key = randomUUID();
    const first = await placeOrder(request, { items: [{ variantId: variant.id, quantity: 1 }], key });
    const second = await placeOrder(request, { items: [{ variantId: variant.id, quantity: 1 }], key });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.orderNumber).toBe(first.body.orderNumber);
    expect((await variantBySku(SHIRT)).reserved).toBe(1);
  });

  test("a request without an Idempotency-Key is rejected", async ({ request }) => {
    const res = await request.post(`${BASE}/api/orders`, { data: {} });
    expect(res.status()).toBe(400);
  });
});

test.describe("abandoned and forgotten orders", () => {
  test("an unconfirmed order whose reservation expires is cancelled and its stock goes back on sale", async ({ request }) => {
    const variant = await setStock(SHIRT, 1);
    const placed = await placeOrder(request, { items: [{ variantId: variant.id, quantity: 1 }] });
    expect(placed.status).toBe(201);
    // Sold out while reserved…
    const blocked = await placeOrder(request, { items: [{ variantId: variant.id, quantity: 1 }] });
    expect(blocked.status).toBe(409);

    // …until the reservation window passes and the cron runs.
    await sql`update orders set reservation_expires_at = now() - interval '1 minute' where order_number = ${String(placed.body.orderNumber)}`;
    const cron = await request.get(`${BASE}/api/cron/expire-reservations`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(cron.status()).toBe(200);

    const rows = (await orderRows()) as Array<{ orderStatus: string }>;
    expect(rows[0].orderStatus).toBe("cancelled");
    expect((await variantBySku(SHIRT)).reserved).toBe(0);
    const again = await placeOrder(request, { items: [{ variantId: variant.id, quantity: 1 }] });
    expect(again.status, "stock is purchasable again").toBe(201);
  });

  test("the cron endpoints refuse requests without the secret", async ({ request }) => {
    for (const path of ["expire-reservations", "sales", "search-reindex"]) {
      const res = await request.get(`${BASE}/api/cron/${path}`);
      expect(res.status(), path).toBe(401);
    }
  });

  test("reserved-stock drift (a worker that died mid-checkout) is repaired by the reconciler", async ({ request }) => {
    const variant = await setStock(SHIRT, 10);
    await sql`update product_variants set reserved_quantity = 7, updated_at = now() - interval '1 hour' where id = ${variant.id}`;
    const res = await request.get(`${BASE}/api/cron/sales`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(res.status()).toBe(200);
    expect((await res.json()).repaired).toBeGreaterThanOrEqual(1);
    expect((await variantBySku(SHIRT)).reserved).toBe(0);
  });

  test("the reconciler leaves a variant alone while an order is still being created (recently touched)", async ({ request }) => {
    const variant = await setStock(SHIRT, 10);
    await sql`update product_variants set reserved_quantity = 3, updated_at = now() where id = ${variant.id}`;
    await request.get(`${BASE}/api/cron/sales`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect((await variantBySku(SHIRT)).reserved).toBe(3);
  });
});

test.describe("admin double-clicks", () => {
  test("cancelling the same order twice at once releases its stock exactly once", async ({ request }) => {
    const variant = await setStock(SHIRT, 10);
    const other = await placeOrder(request, { items: [{ variantId: variant.id, quantity: 3 }], name: "E2E Other" });
    const mine = await placeOrder(request, { items: [{ variantId: variant.id, quantity: 2 }], name: "E2E Mine" });
    expect(other.status).toBe(201);
    expect(mine.status).toBe(201);
    expect((await variantBySku(SHIRT)).reserved).toBe(5);

    await adminCookie(request);
    const [row] = (await sql`select id from orders where order_number = ${String(mine.body.orderNumber)}`) as Array<{ id: string }>;
    const results = await Promise.all(
      Array.from({ length: 4 }, () => request.post(`${BASE}/api/admin/orders/${row.id}/status`, { data: { toStatus: "cancelled" } })),
    );
    const codes = results.map((r) => r.status()).sort();
    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 409 || c === 400)).toHaveLength(3);
    // 5 − 2 = 3: the other customer's 3 pieces must stay reserved.
    expect((await variantBySku(SHIRT)).reserved).toBe(3);
  });

  test("admin endpoints reject anonymous callers", async ({ playwright }) => {
    const anon = await playwright.request.newContext();
    for (const [method, path] of [
      ["GET", "/api/admin/products"],
      ["GET", "/api/admin/flash-sales"],
      ["POST", "/api/admin/push"],
    ] as const) {
      const res = await anon.fetch(`${BASE}${path}`, { method, data: method === "POST" ? {} : undefined });
      expect(res.status(), path).toBe(401);
    }
    await anon.dispose();
  });
});
