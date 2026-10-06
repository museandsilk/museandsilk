import { expect, test, type Page } from "@playwright/test";
import { cleanOrders, orderIdOf, placeOrder, setStock, sql, variantBySku, warmUp } from "../support/helpers";
import { noHorizontalOverflow, watchErrors } from "../support/ui";

const SKU = "NA-TE-SAS-M";
const PHONE = "+923001234567";

async function order(request: Parameters<typeof placeOrder>[0], quantity = 1): Promise<{ number: string; id: string }> {
  const v = await setStock(SKU, 30);
  const placed = await placeOrder(request, { items: [{ variantId: v.id, quantity }], name: "E2E Self", phone: PHONE });
  expect(placed.status, JSON.stringify(placed.body)).toBe(201);
  const number = String(placed.body.orderNumber);
  return { number, id: await orderIdOf(number) };
}

async function lookup(page: Page, number: string) {
  await page.goto(`/track-order?order=${encodeURIComponent(number)}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.getByLabel("Phone / WhatsApp").fill("0300 1234567");
  await page.getByRole("button", { name: "Find my order" }).click();
  await expect(page.locator(".tracking-result h2")).toBeVisible({ timeout: 20_000 });
}

test.beforeAll(async ({ request }) => {
  await warmUp(request, ["/track-order", "/api/orders/track", "/api/orders/cancel", "/api/orders/refund"]);
});
test.beforeEach(async () => {
  await cleanOrders();
});
test.afterAll(async () => {
  await cleanOrders();
});

test.describe("track order: cancel", () => {
  test("a shopper can cancel until TCS has the parcel, with a reason, and the page updates", async ({ page, request }) => {
    const errors = watchErrors(page);
    const { number, id } = await order(request, 2);
    await lookup(page, number);
    await noHorizontalOverflow(page, "track order");
    await page.getByRole("button", { name: "Cancel my order" }).click();
    await page.getByLabel("Why are you cancelling?").selectOption("ordered_by_mistake");
    const confirm = page.getByRole("button", { name: "Yes, cancel my order" });
    let posts = 0;
    await page.route("**/api/orders/cancel", async (route) => {
      posts += 1;
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });
    await confirm.dblclick();
    await expect(page.getByText("Your order has been cancelled.")).toBeVisible({ timeout: 20_000 });
    expect(posts, "double tap sends one request").toBe(1);
    await expect(page.locator(".tracking-result h2")).toContainText(/cancelled/i);
    await expect(page.getByRole("button", { name: "Cancel my order" })).toHaveCount(0);
    const [row] = (await sql`select order_status as s, cancelled_by as by from orders where id = ${id}`) as Array<{ s: string; by: string }>;
    expect(row).toEqual({ s: "cancelled", by: "customer" });
    expect((await variantBySku(SKU)).reserved).toBe(0);
    expect(errors).toEqual([]);
  });

  test("once TCS has the parcel there is no cancel button, just a clear explanation", async ({ page, request }) => {
    const { number, id } = await order(request);
    await sql`update orders set order_status = 'shipped', handed_over_at = now(), courier_tracking_number = '779412326902', courier_status = 'Out For Delivery' where id = ${id}`;
    await lookup(page, number);
    await expect(page.getByRole("button", { name: "Cancel my order" })).toHaveCount(0);
    await expect(page.getByText(/handed to TCS, so it can't be cancelled/i)).toBeVisible();
    await expect(page.getByText(/779412326902/)).toBeVisible();
    await expect(page.getByText(/Out for delivery today/)).toBeVisible();
  });

  test("a cancel that loses a race with the pickup shows the reason instead of failing silently", async ({ page, request }) => {
    const { number, id } = await order(request);
    await lookup(page, number);
    await page.getByRole("button", { name: "Cancel my order" }).click();
    // TCS collects the parcel while the shopper is still deciding
    await sql`update orders set order_status = 'shipped', handed_over_at = now() where id = ${id}`;
    await page.getByRole("button", { name: "Yes, cancel my order" }).click();
    await expect(page.locator(".order-help-form .checkout-error")).toContainText(/handed to TCS/i, { timeout: 15_000 });
  });
});

test.describe("track order: refund", () => {
  async function deliveredOrder(request: Parameters<typeof placeOrder>[0]) {
    const o = await order(request);
    await sql`update orders set order_status = 'delivered', payment_status = 'paid' where id = ${o.id}`;
    await sql`insert into order_status_history (order_id, from_status, to_status, actor_email) values (${o.id}, 'shipped', 'delivered', 'system')`;
    return o;
  }

  test("a shopper asks for a refund from a phone-sized form, with payout details", async ({ page, request }) => {
    const errors = watchErrors(page);
    const { number, id } = await deliveredOrder(request);
    await lookup(page, number);
    await page.getByRole("button", { name: "Ask for a refund" }).click();
    await noHorizontalOverflow(page, "refund form");
    const send = page.getByRole("button", { name: "Send refund request" });
    await send.click(); // empty form → browser validation stops it
    await expect(page.getByText("Your refund request has been sent")).toHaveCount(0);

    await page.getByLabel("What went wrong?").selectOption("wrong_size");
    await page.getByLabel("Tell us more (optional)").fill("Medium is too small for me.");
    await page.getByLabel("Where should we send your money?").selectOption("easypaisa");
    await page.getByLabel("Account or mobile wallet number").fill("03451234567");
    await page.getByLabel("Name on that account").fill("Test Shopper");
    await send.dblclick();
    await expect(page.getByText("Your refund request has been sent")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator(".order-help-card", { hasText: "Refund" })).toContainText(/received your refund request/i);
    await expect(page.getByRole("button", { name: "Ask for a refund" })).toHaveCount(0);
    const rows = await sql`select reason, payout_method as m, payout_account as a from refund_requests where order_id = ${id}`;
    expect(rows).toEqual([{ reason: "wrong_size", m: "easypaisa", a: "03451234567" }]);
    expect(errors).toEqual([]);
  });

  test("a refund that the owner declined shows the owner's reason", async ({ page, request }) => {
    const { number, id } = await deliveredOrder(request);
    await sql`insert into refund_requests (order_id, source, reason, amount, payout_method, payout_account, payout_title, status, admin_note) values (${id}, 'customer', 'quality', 5500, 'bank', 'PK36SCBL0000001123456702', 'X Y', 'rejected', 'The item shows signs of use.')`;
    await lookup(page, number);
    await expect(page.getByText(/could not approve this refund request/i)).toBeVisible();
    await expect(page.getByText(/shows signs of use/)).toBeVisible();
  });
});

test.describe("shop footer", () => {
  test("Facebook, Instagram, TikTok, WhatsApp and the phone number are linked", async ({ page }) => {
    await page.goto("/contact");
    const footer = page.locator("footer.footer");
    await expect(footer.getByRole("link", { name: "Facebook" })).toHaveAttribute("href", /facebook\.com/);
    await expect(footer.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", /instagram\.com\/nureasmirofficial/);
    await expect(footer.getByRole("link", { name: "TikTok" })).toHaveAttribute("href", /tiktok\.com\/@nure\.asmir/);
    await expect(footer.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /wa\.me/);
    await expect(footer.getByRole("link", { name: "+923116111963" })).toHaveAttribute("href", "tel:+923116111963");
    for (const name of ["Facebook", "TikTok"]) await expect(page.locator("main").getByRole("link", { name: new RegExp(`Visit ${name}`) })).toBeVisible();
    await noHorizontalOverflow(page, "footer");
  });
});

test.describe("search never goes dark (built-in engine takes over when Algolia is off or out of allowance)", () => {
  test("typing in the search box returns products, including with Pakistani spellings, and the search list is fetched on demand only", async ({ page }) => {
    const errors = watchErrors(page);
    const indexRequests: string[] = [];
    page.on("request", (request) => request.url().includes("/api/search/index") && indexRequests.push(request.url()));
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    expect(indexRequests, "nothing is loaded before the first search").toHaveLength(0);
    await page.getByRole("button", { name: "Search" }).first().click();
    const input = page.getByRole("searchbox", { name: "Search products" });
    await input.fill("qameez");
    await expect(page.locator(".search-hit").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".search-hit-title").first()).toContainText(/kameez/i);
    await input.fill("trousers");
    await expect(page.locator(".search-hit-title").first()).toContainText(/pants/i, { timeout: 10_000 });
    await input.fill("zzzzqqqq");
    await expect(page.getByText(/no matches/i)).toBeVisible();
    expect(indexRequests.length, "the product list is downloaded once").toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("products that are hidden (draft) never show up in search results", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Search" }).first().click();
    const input = page.getByRole("searchbox", { name: "Search products" });
    await input.fill("belt");
    await expect(page.locator(".search-hit-title").first()).toContainText(/belt/i, { timeout: 20_000 });
    await input.fill("wallet"); // the wallet is a hidden draft in the demo data
    await expect(page.getByText(/no matches/i)).toBeVisible({ timeout: 10_000 });
  });
});
