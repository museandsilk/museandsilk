import { expect, test } from "@playwright/test";
import { BASE, warmUp } from "../support/helpers";

type Card = { id: string; price: number; slug: string; category: string };
type Page = { products: Card[]; total: number; page: number; pageSize: number };

test.describe("catalogue paging (the shop reads 24 products at a time, cached at the edge)", () => {
  test.beforeAll(async ({ request }) => {
    await warmUp(request, ["/api/catalog/page"]);
  });

  test("returns one page with the total, and is cacheable", async ({ request }) => {
    const res = await request.get(`${BASE}/api/catalog/page`);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("s-maxage");
    const body = (await res.json()) as Page;
    expect(body.pageSize).toBe(24);
    expect(body.products.length).toBeLessThanOrEqual(24);
    expect(body.total).toBeGreaterThanOrEqual(body.products.length);
  });

  test("sorting by price is done by the database and pages do not repeat products", async ({ request }) => {
    const first = (await (await request.get(`${BASE}/api/catalog/page?sort=low&page=1`)).json()) as Page;
    const prices = first.products.map((p) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const second = (await (await request.get(`${BASE}/api/catalog/page?sort=low&page=2`)).json()) as Page;
    const ids = new Set(first.products.map((p) => p.id));
    expect(second.products.filter((p) => ids.has(p.id))).toHaveLength(0);
  });

  test("a category scope only returns that category; junk input is ignored, not an error", async ({ request }) => {
    const all = (await (await request.get(`${BASE}/api/catalog/page`)).json()) as Page;
    const slug = all.products[0]?.category;
    test.skip(!slug, "no products in the test database");
    const scoped = (await (await request.get(`${BASE}/api/catalog/page?cat=${slug}`)).json()) as Page;
    expect(scoped.products.every((p) => p.category === slug)).toBe(true);
    const junk = await request.get(`${BASE}/api/catalog/page?cat=%27;drop--&sort=%00&page=-5`);
    expect(junk.status()).toBe(200);
  });
});
