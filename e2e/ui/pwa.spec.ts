import { expect, test, type Page } from "@playwright/test";

/**
 * Browser-cache behaviour of the service worker (public/sw.js). Needs a PRODUCTION build served on :3200:
 *
 *   NEXT_DIST_DIR=.next-prod npx next build && E2E_PROD=1 npx playwright test --project=pwa
 *
 * (the worker is intentionally not registered in `next dev`).
 */
const SW_READY = async (page: Page) => {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
        void registration.active?.postMessage("claim");
        setTimeout(resolve, 3000);
      });
    }
  });
};

async function cacheNames(page: Page): Promise<string[]> {
  return page.evaluate(() => caches.keys());
}
async function cachedUrls(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate(async (p) => {
    const names = (await caches.keys()).filter((n) => n.startsWith(p));
    const urls: string[] = [];
    for (const name of names) for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
    return urls;
  }, prefix);
}

test.beforeAll(async ({ request }) => {
  // A cold production server renders its first pages slowly; warm them so `load` fires promptly.
  for (const path of ["/", "/shop", "/about", "/cart", "/api/currency", "/cdn/campaign/seed-storefront-w1600.webp"]) await request.get(path, { failOnStatusCode: false }).catch(() => null);
});

test.describe("service worker", () => {
  test("registers once with a build-versioned URL and takes control", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 45_000 }).toBe(1);
    const script = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL ?? "");
    expect(script).toMatch(/\/sw\.js\?v=/);
    await SW_READY(page);
  });

  test("static chunks and product images are cached in the browser; pages are cached for fast repeat visits", async ({ page }) => {
    await page.goto("/shop");
    await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 45_000 }).toBe(1);
    await SW_READY(page);
    await page.reload();
    await page.goto("/");
    await page.goto("/shop");
    await page.waitForTimeout(1500);

    const names = await cacheNames(page);
    expect(names.some((n) => n.startsWith("na-static-"))).toBe(true);
    expect(names.some((n) => n.startsWith("na-pages-"))).toBe(true);
    expect(await cachedUrls(page, "na-static-")).toEqual(expect.arrayContaining([expect.stringMatching(/^\/_next\/static\//)]));
    const pages = await cachedUrls(page, "na-pages-");
    expect(pages).toEqual(expect.arrayContaining(["/shop"]));
    expect((await cachedUrls(page, "na-images-")).some((p) => p.startsWith("/cdn/"))).toBe(true);
  });

  test("private areas are never stored: admin, API, cart, checkout, order tracking, wishlist", async ({ page }) => {
    await page.goto("/");
    await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 45_000 }).toBe(1);
    await SW_READY(page);
    for (const path of ["/cart", "/checkout", "/track-order", "/wishlist", "/admin/login"]) await page.goto(path);
    await page.request.post("/api/cart-availability", { data: { variantIds: [] }, failOnStatusCode: false });
    await page.evaluate(() => fetch("/api/checkout/options"));
    const all = [...(await cachedUrls(page, "na-pages-")), ...(await cachedUrls(page, "na-static-"))];
    for (const forbidden of [/^\/admin/, /^\/api\/(?!currency|catalog)/, /^\/cart/, /^\/checkout/, /^\/track-order/, /^\/wishlist/]) {
      expect(all.filter((p) => forbidden.test(p)), String(forbidden)).toEqual([]);
    }
  });

  test("offline: a page visited before still opens; an unvisited page degrades to the cached home page", async ({ page, context }) => {
    await page.goto("/shop");
    await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 45_000 }).toBe(1);
    await SW_READY(page);
    await page.goto("/");
    await page.goto("/shop");
    await page.waitForTimeout(1500);

    await context.setOffline(true);
    await page.goto("/shop");
    await expect(page.locator(".pcard").first()).toBeVisible();
    await page.goto("/about"); // never visited
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("header.site-header")).toBeVisible(); // fell back to the cached shell, not a browser error page
    await context.setOffline(false);
  });

  test("stale-while-revalidate: the cached answer is served instantly and refreshed behind the scenes (10 min TTL for APIs)", async ({ page, context }) => {
    let version = 1;
    await context.route("**/api/currency", (route) => route.fulfill({ json: { date: "d", fetchedAt: 1, rates: { PKR: 1, USD: version } } }));
    await page.goto("/");
    await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 45_000 }).toBe(1);
    await SW_READY(page);

    const read = () => page.evaluate(async () => ((await (await fetch("/api/currency")).json()) as { rates: { USD: number } }).rates.USD);
    expect(await read(), "first call hits the network").toBe(1);
    version = 2;
    expect(await read(), "second call is answered from cache while the network refreshes").toBe(1);
    await page.waitForTimeout(800);
    expect(await read(), "after the background refresh the new value is served").toBe(2);

    // Entries older than the TTL are not trusted: age the cached copy by 11 minutes.
    version = 3;
    await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        if (!name.startsWith("na-pages-")) continue;
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          if (!req.url.includes("/api/currency")) continue;
          const old = await cache.match(req);
          if (!old) continue;
          const headers = new Headers(old.headers);
          headers.set("x-sw-cached-at", String(Date.now() - 11 * 60 * 1000));
          await cache.put(req, new Response(await old.blob(), { status: 200, headers }));
        }
      }
    });
    expect(await read(), "expired entry → fresh network answer").toBe(3);
  });

  test("a new deploy (new ?v=) discards the previous build's page and chunk caches but keeps product images", async ({ page }) => {
    await page.goto("/shop");
    await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 45_000 }).toBe(1);
    await SW_READY(page);
    await page.goto("/");
    await page.goto("/shop");
    await page.waitForTimeout(1200);
    const before = await cacheNames(page);
    expect(before.filter((n) => n.startsWith("na-pages-") || n.startsWith("na-static-")).length).toBeGreaterThan(0);

    await page.evaluate(async () => {
      const cache = await caches.open("na-pages-previousbuild");
      await cache.put("/stale", new Response("stale"));
      await navigator.serviceWorker.register("/sw.js?v=nextbuild");
    });
    await expect
      .poll(async () => (await cacheNames(page)).filter((n) => n.startsWith("na-pages-") || n.startsWith("na-static-")).sort(), { timeout: 20_000 })
      .not.toContain("na-pages-previousbuild");
    const after = await cacheNames(page);
    expect(after).not.toContain("na-pages-previousbuild");
    expect(after.some((n) => n === "na-images-v1")).toBe(true);
  });
});

test.describe("HTTP cache headers", () => {
  test("images are immutable for a year, rates are cached at the edge, HTML is edge-cacheable", async ({ request }) => {
    const img = await request.get("/cdn/campaign/seed-storefront-w1600.webp");
    expect(img.headers()["cache-control"]).toContain("immutable");
    expect(img.headers()["cache-control"]).toContain("max-age=31536000");

    const rates = await request.get("/api/currency");
    expect(rates.headers()["cache-control"]).toMatch(/s-maxage=3600/);

    const options = await request.get("/api/checkout/options");
    expect(options.headers()["cache-control"]).toMatch(/s-maxage=60/);

    const html = await request.get("/shop");
    expect(html.headers()["cache-control"]).toMatch(/s-maxage=\d+/);
    expect(html.headers()["content-security-policy"]).toContain("script-src");
  });

  test("responses are compressed", async ({ request }) => {
    const res = await request.get("/shop", { headers: { "accept-encoding": "br, gzip" } });
    expect(["br", "gzip"]).toContain(res.headers()["content-encoding"]);
  });
});
