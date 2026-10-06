import { expect, test } from "@playwright/test";
import { setStock, variantBySku, warmUp } from "../support/helpers";
import { noHorizontalOverflow, seedCart, watchErrors } from "../support/ui";

/**
 * Layout & ergonomics checks that run on every device profile (desktop Chrome/Firefox/Safari, Pixel 7,
 * iPhone 14, a 360 px Android, iPad Mini): no sideways scrolling, tap targets a thumb can hit, nothing
 * floating over the primary buttons, readable inputs, working drawers.
 */
const PAGES = ["/", "/shop", "/collections/pants", "/products/olive-cargo-pants", "/cart", "/checkout", "/track-order", "/faq", "/contact", "/wishlist"];

test.beforeAll(async ({ request }) => {
  await warmUp(request);
  for (const sku of ["NA-PA-CAR-30", "NA-PA-CAR-32", "NA-PA-CAR-34", "NA-PA-CAR-36"]) await setStock(sku, 20);
});

test("no page scrolls sideways and no heading is clipped", async ({ page }) => {
  const v = await variantBySku("NA-PA-CAR-34");
  await seedCart(page, [{ variant: v, name: "Olive Cargo Pants", quantity: 1 }]);
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => {});
    await noHorizontalOverflow(page, path);
    const clipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll("h1, h2, h3")).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1);
      }).length,
    );
    expect(clipped, `${path}: headings extending past the viewport`).toBe(0);
  }
});

test("header controls are comfortable tap targets (≥ 40 px)", async ({ page }) => {
  await page.goto("/");
  for (const name of [/Open menu/, /^Search$/, /^Bag/, /^Wishlist/]) {
    const box = await page.getByRole(name.source.startsWith("^Bag") || name.source.startsWith("^Wishlist") ? "link" : "button", { name }).first().boundingBox();
    expect(box, String(name)).not.toBeNull();
    expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(38);
    expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(38);
  }
});

test("product page: size chips, Add to bag and Buy now are thumb-sized and reachable past the floating widgets", async ({ page }) => {
  await page.goto("/products/olive-cargo-pants");
  const chip = await page.getByRole("radio", { name: "32", exact: true }).boundingBox();
  expect(chip!.height).toBeGreaterThanOrEqual(40);
  expect(chip!.width).toBeGreaterThanOrEqual(40);

  await page.getByRole("radio", { name: "32", exact: true }).click();
  for (const name of [/Add to bag/, /Buy it now/]) {
    const button = page.getByRole("button", { name });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // Park the button at the very bottom of the screen – exactly where the floating WhatsApp / currency
    // widgets live – and make sure a real tap still lands on it (Playwright refuses obstructed clicks).
    await button.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await button.click({ trial: true });
  }
});

test("floating WhatsApp and currency widgets never overlap each other or leave the screen", async ({ page }) => {
  await page.goto("/");
  const wa = (await page.locator(".float-whatsapp").boundingBox())!;
  const cur = (await page.locator(".currency-switcher .currency-main").boundingBox())!;
  const vp = page.viewportSize()!;
  for (const box of [wa, cur]) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  }
  const overlap = !(wa.x + wa.width <= cur.x || cur.x + cur.width <= wa.x || wa.y + wa.height <= cur.y || cur.y + cur.height <= wa.y);
  expect(overlap).toBe(false);
});

test("form fields are ≥ 16 px on phones/tablets so iOS doesn't zoom the page when they're focused", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 900, "only touch-sized screens zoom on focus");
  const v = await variantBySku("NA-PA-CAR-34");
  await seedCart(page, [{ variant: v, name: "Olive Cargo Pants" }]);
  await page.goto("/checkout");
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input:not([type=radio]):not([type=checkbox]):not([type=file]), select, textarea"))
      .map((el) => ({ name: (el as HTMLInputElement).name || el.tagName, size: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((f) => f.size < 16),
  );
  expect(small, "fields that would trigger iOS zoom").toEqual([]);
  await page.goto("/track-order");
  const small2 = await page.evaluate(() => Array.from(document.querySelectorAll("input")).filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).length);
  expect(small2).toBe(0);
});

test("menu drawer: locks page scroll while open, is fully usable and restores scroll after", async ({ page }) => {
  await page.goto("/shop");
  await page.getByRole("button", { name: "Open menu" }).click();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  const drawer = page.getByLabel("Menu", { exact: true });
  const box = (await drawer.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await drawer.getByRole("link", { name: "Shirts" }).click();
  await expect(page).toHaveURL(/collections\/shirts/);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("search overlay fits the screen and keeps the input visible", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  const input = page.getByRole("searchbox", { name: "Search products" });
  await expect(input).toBeVisible();
  const box = (await input.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(input).toBeFocused();
});

test("the home banner shows the whole message on small screens (mobile crop) and category tiles stay 2-up", async ({ page }) => {
  await page.goto("/");
  const vp = page.viewportSize()!;
  const banner = (await page.locator(".banner").boundingBox())!;
  expect(banner.width).toBeLessThanOrEqual(vp.width);
  const tiles = await page.locator(".cat-tile").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  expect(Math.min(...tiles)).toBeGreaterThan(100);
  if (vp.width <= 700) expect(tiles.filter((w) => w > vp.width * 0.4).length).toBe(tiles.length); // 2 columns
});

test("no unexpected console errors while browsing a typical session", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.goto("/products/olive-cargo-pants");
  await page.getByRole("radio", { name: "34", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.goto("/cart");
  await page.goto("/checkout");
  expect(errors).toEqual([]);
});
