import { expect, type Page } from "@playwright/test";
import { variantBySku, type Variant } from "./helpers";

export const CART_KEY = "nure-asmir-cart";

/** Collects uncaught page errors and console errors, ignoring noise that is not our code's fault. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    // WebKit reports requests cancelled by a navigation as "… due to access control checks" / "Load failed".
    if (/due to access control checks|^Load failed$|Failed to load chunk .*hmr-client/.test(error.message)) return;
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|Failed to load resource.*(404|403)|net::ERR_ABORTED|Download the React DevTools|\[Fast Refresh\]|googletagmanager|facebook|cloudflareinsights|Image corrupt or truncated|downloadable font/i.test(text)) return; // (the last: Firefox when navigation cancels an image download)
    // Next dev overlay hydration notes about the CSP nonce attribute are expected in dev only.
    if (/nonce/i.test(text) && /hydrat/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

export async function seedCart(page: Page, items: Array<{ variant: Variant; name: string; quantity?: number; addedAt?: number; price?: number; available?: number; slug?: string }>) {
  const cart = items.map((item) => ({
    variantId: item.variant.id,
    productId: item.variant.productId,
    slug: item.slug ?? "olive-cargo-pants",
    name: item.name,
    variantName: item.variant.name,
    sku: item.variant.sku,
    price: item.price ?? item.variant.price,
    quantity: item.quantity ?? 1,
    available: item.available ?? 10,
    addedAt: item.addedAt ?? Date.now(),
  }));
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key as string, value as string), [CART_KEY, JSON.stringify(cart)]);
}

export async function noHorizontalOverflow(page: Page, label = "") {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth, `horizontal overflow ${label} (scrollWidth ${scrollWidth} > viewport ${innerWidth})`).toBeLessThanOrEqual(innerWidth + 1);
}

/** Scroll the whole page so lazy images load, then report images that failed to decode. */
export async function brokenImages(page: Page): Promise<string[]> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight * 0.8) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
  return page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0 && img.currentSrc && !img.currentSrc.startsWith("data:"))
      .map((img) => img.currentSrc),
  );
}

export async function openProduct(page: Page, slug: string) {
  await page.goto(`/products/${slug}`);
  await expect(page.locator("h1")).toBeVisible();
}

export async function pickSize(page: Page, size: string) {
  await page.getByRole("radio", { name: size, exact: true }).click();
}

export async function cartCountInHeader(page: Page): Promise<number> {
  const text = await page.locator('a[aria-label^="Bag"] .cart-count').textContent();
  return Number(text ?? 0);
}

export const pantsM = () => variantBySku("NA-PA-CAR-34");
