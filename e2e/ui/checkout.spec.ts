import { expect, test, type Page } from "@playwright/test";
import { cleanOrders, clearPushDevices, placeOrder, setStock, sql, variantBySku, warmUp, setBankDeposit } from "../support/helpers";
import { noHorizontalOverflow, seedCart, watchErrors } from "../support/ui";

const SKU = "NA-TE-SAS-M";

async function fillCheckout(page: Page, name = "E2E Buyer") {
  await page.locator('input[name="customerName"]').fill(name);
  await page.locator('input[name="customerPhone"]').fill("+923001234567");
  await page.locator('textarea[name="address"]').fill("House 1, Street 2, DHA");
  await page.locator('input[name="city"]').fill("Karachi");
  await page.getByRole("combobox", { name: "Province" }).click();
  await page.getByRole("option", { name: "Sindh" }).click();
}

async function ordersInDb(prefix = "E2E") {
  return (await sql`select order_number as n, order_status as s from orders where customer_name like ${prefix + "%"}`) as Array<{ n: string; s: string }>;
}

test.beforeAll(async ({ request }) => {
  await setBankDeposit(true);
  await warmUp(request);
});
test.beforeEach(async ({ page }) => {
  await cleanOrders();
  await clearPushDevices();
  await setStock(SKU, 10);
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("__e2e_cleared")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("__e2e_cleared", "1");
    }
  });
});
test.afterAll(async () => {
  await setBankDeposit(false);
  await cleanOrders();
});

test.describe("placing an order", () => {
  test("cash on delivery, start to finish", async ({ page }) => {
    const errors = watchErrors(page);
    const v = await variantBySku(SKU);
    await seedCart(page, [{ variant: v, name: "Ivory Sashiko Tee", slug: "ivory-sashiko-tee", quantity: 2 }]);
    await page.goto("/checkout");
    await expect(page.getByRole("button", { name: /Place order/ })).toBeDisabled(); // no contact info yet
    await fillCheckout(page);
    await noHorizontalOverflow(page, "checkout");
    await page.getByRole("button", { name: /Place order/ }).click();

    await expect(page.getByRole("heading", { name: /Thank you/ })).toBeVisible({ timeout: 20_000 });
    const number = (await page.locator(".order-success strong").first().textContent())!.trim();
    expect(number).toMatch(/^NA-\d{6}-\d{6}$/);
    const rows = await ordersInDb();
    expect(rows).toEqual([{ n: number, s: "pending_confirmation" }]);
    expect((await variantBySku(SKU)).reserved).toBe(2);
    // the bag is emptied and a new visit shows it empty
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nure-asmir-cart") ?? "[]").length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("double-click / rapid taps on 'Place order' send ONE request, show a spinner and create ONE order", async ({ page }) => {
    const v = await variantBySku(SKU);
    await seedCart(page, [{ variant: v, name: "Ivory Sashiko Tee", slug: "ivory-sashiko-tee" }]);
    let posts = 0;
    await page.route("**/api/orders", async (route) => {
      if (route.request().method() === "POST") {
        posts += 1;
        await new Promise((r) => setTimeout(r, 1500)); // a slow connection makes impatient tapping likely
      }
      await route.continue();
    });
    await page.goto("/checkout");
    await fillCheckout(page);
    const button = page.getByRole("button", { name: /Place order|Placing order/ });
    await button.dblclick();
    await expect(page.getByText("Placing order…")).toBeVisible();
    await expect(button).toBeDisabled();
    await button.click({ force: true }).catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
    await expect(page.getByRole("heading", { name: /Thank you/ })).toBeVisible({ timeout: 20_000 });
    expect(posts, "only one order request must leave the browser").toBe(1);
    expect(await ordersInDb()).toHaveLength(1);
    expect((await variantBySku(SKU)).reserved).toBe(1);
  });

  test("connection drops after the server accepted the order: retrying never creates a second order", async ({ page }) => {
    const v = await variantBySku(SKU);
    await seedCart(page, [{ variant: v, name: "Ivory Sashiko Tee", slug: "ivory-sashiko-tee" }]);
    let firstAttempt = true;
    await page.route("**/api/orders", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      if (firstAttempt) {
        firstAttempt = false;
        await route.fetch(); // the server processes it…
        return route.abort("connectionreset"); // …but the shopper never sees the answer
      }
      return route.continue();
    });
    await page.goto("/checkout");
    await fillCheckout(page);
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.locator(".checkout-error")).toContainText(/could not be placed/i);
    await expect(page.getByRole("button", { name: /Place order/ })).toBeEnabled(); // button unlocked again
    expect(await ordersInDb()).toHaveLength(1); // it did go through server-side

    // Same page: retry.
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.getByRole("heading", { name: /Thank you/ })).toBeVisible({ timeout: 20_000 });
    expect(await ordersInDb()).toHaveLength(1);
    expect((await variantBySku(SKU)).reserved).toBe(1);
  });

  test("closing the tab mid-order and coming back later still yields a single order", async ({ page, context }) => {
    const v = await variantBySku(SKU);
    await seedCart(page, [{ variant: v, name: "Ivory Sashiko Tee", slug: "ivory-sashiko-tee" }]);
    await page.route("**/api/orders", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fetch();
      return route.abort("connectionreset");
    });
    await page.goto("/checkout");
    await fillCheckout(page);
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.locator(".checkout-error")).toBeVisible();
    await page.close(); // user gives up / loses signal

    const again = await context.newPage();
    await again.goto("/checkout"); // bag is still there (order never confirmed to the browser)
    await expect(again.getByRole("button", { name: /Place order/ })).toBeVisible();
    await fillCheckout(again);
    await again.getByRole("button", { name: /Place order/ }).click();
    await expect(again.getByRole("heading", { name: /Thank you/ })).toBeVisible({ timeout: 20_000 });
    expect(await ordersInDb(), "same idempotency key reused → no duplicate").toHaveLength(1);
  });

  test("someone else takes the last piece while you are filling in the form: clear message, bag kept, button re-enabled", async ({ page, request }) => {
    const v = await setStock(SKU, 1);
    await seedCart(page, [{ variant: v, name: "Ivory Sashiko Tee", slug: "ivory-sashiko-tee", available: 1 }]);
    await page.goto("/checkout");
    await fillCheckout(page);
    const rival = await placeOrder(request, { items: [{ variantId: v.id, quantity: 1 }], name: "E2E Rival" });
    expect(rival.status).toBe(201);

    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.locator(".checkout-error")).toContainText(/enough available stock/i);
    await expect(page.getByRole("button", { name: /Place order/ })).toBeEnabled();
    expect(await ordersInDb()).toHaveLength(1); // only the rival's
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nure-asmir-cart") ?? "[]").length)).toBe(1);
  });

  test("an item that sold out since it was added is removed when checkout opens", async ({ page }) => {
    const v = await setStock(SKU, 5);
    await seedCart(page, [{ variant: v, name: "Ivory Sashiko Tee", slug: "ivory-sashiko-tee", available: 5 }]);
    await setStock(SKU, 0);
    await page.goto("/checkout");
    await expect(page.locator(".cart-stock-notice")).toContainText("no longer available");
    await expect(page.getByText("Your bag is empty.")).toBeVisible();
  });

  test("bank deposit: details shown, receipt upload is locked while uploading and stored once", async ({ page }) => {
    const v = await variantBySku(SKU);
    await seedCart(page, [{ variant: v, name: "Ivory Sashiko Tee", slug: "ivory-sashiko-tee" }]);
    await page.goto("/checkout");
    await fillCheckout(page);
    await page.getByText("Bank deposit").first().click();
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.getByRole("heading", { name: "Bank deposit details" })).toBeVisible({ timeout: 20_000 });

    let uploads = 0;
    await page.route("**/api/orders/payment-proof", async (route) => {
      uploads += 1;
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==", "base64");
    await page.locator('input[type="file"]').setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
    const submit = page.getByRole("button", { name: /Submit receipt|Uploading/ });
    await submit.dblclick();
    await expect(page.getByText("Uploading…")).toBeVisible();
    await expect(page.getByText("Receipt received")).toBeVisible({ timeout: 15_000 });
    expect(uploads).toBe(1);
    expect((await sql`select count(*)::int as n from payment_proofs`)[0].n).toBe(1);
  });
});

test.describe("tracking an order", () => {
  test("right phone shows the timeline, wrong phone is refused, and the button locks while looking up", async ({ page, request }) => {
    const v = await variantBySku(SKU);
    const placed = await placeOrder(request, { items: [{ variantId: v.id, quantity: 1 }], phone: "+923001234567" });
    const number = String(placed.body.orderNumber);

    let lookups = 0;
    await page.route("**/api/orders/track", async (route) => {
      lookups += 1;
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.goto(`/track-order?order=${number}`);
    await page.locator('input[name="phone"]').fill("+923009999999");
    const find = page.getByRole("button", { name: /Find my order|Looking/ });
    await find.dblclick();
    await expect(page.getByText("Looking…")).toBeVisible();
    await expect(page.locator(".checkout-error")).toBeVisible({ timeout: 10_000 });
    expect(lookups).toBe(1);

    await page.locator('input[name="phone"]').fill("0300 1234567");
    await page.getByRole("button", { name: "Find my order" }).click();
    await expect(page.locator(".tracking-result h2")).toContainText(/pending confirmation/i);
    await expect(page.locator(".tracking-result")).toContainText("Payment pending");
  });

  test("'Get updates on this device' fails gracefully (no push service in the test browser) and unlocks again", async ({ page, request, browserName }) => {
    test.skip(browserName !== "chromium", "notification permission can only be pre-granted in Chromium");
    // Headless browsers report notifications as "denied"; pretend the shopper allowed them so the flow can run.
    await page.addInitScript(() => {
      Object.defineProperty(Notification, "permission", { get: () => "granted", configurable: true });
      Notification.requestPermission = async () => "granted";
    });
    const v = await variantBySku(SKU);
    const placed = await placeOrder(request, { items: [{ variantId: v.id, quantity: 1 }], phone: "+923001234567" });
    await page.goto(`/track-order?order=${placed.body.orderNumber}`);
    await page.locator('input[name="phone"]').fill("+923001234567");
    await page.getByRole("button", { name: "Find my order" }).click();
    const enable = page.getByRole("button", { name: /Get updates on this device/ });
    await expect(enable).toBeVisible();
    await enable.click();
    await expect(enable).toBeEnabled({ timeout: 30_000 }); // spinner state ends, UI is usable again
  });
});
