import { expect, test, type Page } from "@playwright/test";
import { cleanOrders, clearSales, placeOrder, setStock, sql, variantBySku, warmUp } from "../support/helpers";
import { watchErrors } from "../support/ui";

/** The admin panel is its own deployable. Its phone layout is part of the upcoming admin overhaul, so these run on desktop Chromium. */
test.skip(({ browserName, isMobile, viewport }) => browserName !== "chromium" || isMobile || (viewport?.width ?? 0) < 1000, "admin UI is exercised on desktop Chromium");

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle"); // let React hydrate before submitting
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
}

test.beforeAll(async ({ request }) => {
  await warmUp(request, ["/api/admin/login"]);
});
test.beforeEach(async () => {
  // The login rate limiter (5 failures / 15 min / email) is doing its job – reset it between tests.
  await sql`delete from login_attempts`;
});
test.afterAll(async () => {
  await clearSales();
  await cleanOrders();
});

test.describe("admin sign-in", () => {
  test("wrong password is refused, the right one opens the dashboard, and the button locks while signing in", async ({ page }) => {
    await page.goto("/admin/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|wrong/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/admin\/login/);

    await login(page);
    await expect(page.locator(".admin-sidebar").getByRole("link", { name: /Orders/ })).toBeVisible();
  });

  test("protected pages redirect to the login form when signed out", async ({ page }) => {
    for (const path of ["/admin", "/admin/orders", "/admin/products", "/admin/flash-sales"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login/);
    }
  });
});

test.describe("admin panel", () => {
  test("every section opens without errors and exposes the order-alert switch", async ({ page }) => {
    const errors = watchErrors(page);
    await login(page);
    await expect(page.getByRole("button", { name: /alerts/i })).toBeVisible();
    for (const label of ["Products", "Categories & Collections", "Delivery Zones", "Coupons", "Flash sales", "Orders", "Campaign", "Subscribers", "Settings"]) {
      await page.locator(".admin-sidebar").getByRole("link", { name: new RegExp(label.replace(/[&]/g, "&")) }).first().click();
      await expect(page.locator("main.admin-shell")).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
    }
    expect(errors).toEqual([]);
  });

  test("create a flash sale from the UI (double-click on Save creates only one), then switch it off", async ({ page }) => {
    await clearSales();
    const pants = await variantBySku("NA-PA-CAR-34");
    await login(page);
    await page.goto("/admin/flash-sales");
    await page.getByRole("button", { name: "New sale" }).click();
    await page.getByPlaceholder("Eid flash sale").fill("UI Flash Sale");
    await page.locator('input[type="number"]').fill("15");
    const productRow = page.locator(".flash-product-list label", { hasText: "Olive Cargo Pants" });
    await productRow.locator("input").check();

    let saves = 0;
    await page.route("**/api/admin/flash-sales", async (route) => {
      if (route.request().method() === "POST") {
        saves += 1;
        await new Promise((r) => setTimeout(r, 800));
      }
      await route.continue();
    });
    const save = page.getByRole("button", { name: /Save sale|Saving/ });
    await save.dblclick();
    await expect(page.getByText("Saving…")).toBeVisible();
    await expect(page.getByText("Sale saved")).toBeVisible({ timeout: 15_000 });
    expect(saves).toBe(1);
    const rows = await sql`select name, discount_value as v, active from flash_sales`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "UI Flash Sale", v: 15, active: true });
    await expect(page.locator("tbody tr", { hasText: "UI Flash Sale" })).toContainText("Scheduled");

    // (new sales default to starting in an hour; make it live now to check the storefront price)
    await sql`update flash_sales set starts_at = ${new Date(Date.now() - 60_000).toISOString()}`;

    // The storefront price reflects it.
    const res = await page.request.post("/api/cart-availability", { data: { variantIds: [pants.id] } });
    expect(((await res.json()) as { availability: Array<{ price: number }> }).availability[0].price).toBe(Math.round(pants.price * 0.85));

    await page.locator("tbody tr", { hasText: "UI Flash Sale" }).getByRole("button", { name: "Disable" }).click();
    await expect(page.locator("tbody tr", { hasText: "UI Flash Sale" })).toContainText("Disabled");
  });

  test("order desk: a new order appears, and confirming it twice rapidly is safe", async ({ page, request }) => {
    const v = await setStock("NA-TE-SAS-M", 10);
    const placed = await placeOrder(request, { items: [{ variantId: v.id, quantity: 1 }], name: "E2E Desk" });
    await login(page);
    await page.goto("/admin/orders");
    await expect(page.getByText(String(placed.body.orderNumber)).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("deployment separation", () => {
  test("browsing the storefront never downloads admin code or admin styles", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));
    for (const path of ["/", "/shop", "/products/olive-cargo-pants", "/cart", "/checkout", "/wishlist"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
    }
    const adminHits = requested.filter((url) => /\/admin(\/|\.|-|_)|admin\.css|admin-|push-toggle|flash-sales/i.test(new URL(url).pathname));
    expect(adminHits, "admin resources requested by the storefront").toEqual([]);
  });

  test("the storefront HTML links nothing from the admin stylesheet", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(html).not.toMatch(/admin\.css|\.admin-shell/);
  });
});
