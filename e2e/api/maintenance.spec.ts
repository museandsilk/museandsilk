import { expect, test } from "@playwright/test";
import { BASE, CRON_SECRET, sql, warmUp } from "../support/helpers";

const auth = { Authorization: `Bearer ${CRON_SECRET}` };

async function soldOutProduct(name: string, idleDays: number) {
  await sql`delete from products where name = ${name}`;
  const [cat] = (await sql`select id from categories order by created_at limit 1`) as Array<{ id: string }>;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [product] = (await sql`insert into products (category_id, name, slug, type_label, status) values (${cat.id}, ${name}, ${slug}, 'Shirt', 'published') returning id`) as Array<{ id: string }>;
  await sql`insert into product_variants (product_id, name, sku, color, size, price, stock_quantity, is_default) values (${product.id}, 'Grey / M', ${`${slug}-m`.toUpperCase()}, 'Grey', 'M', 2500, 0, true)`;
  await sql`update product_variants set updated_at = now() - make_interval(days => ${idleDays}) where product_id = ${product.id}`;
  await sql`update products set updated_at = now() - make_interval(days => ${idleDays}) where id = ${product.id}`;
  return product.id;
}
const statusOf = async (id: string) => ((await sql`select status from products where id = ${id}`) as Array<{ status: string }>)[0]?.status;

test.describe("daily housekeeping", () => {
  test.beforeAll(async ({ request }) => {
    await warmUp(request, ["/api/health"]);
  });
  test.afterAll(async () => {
    await sql`delete from products where name like 'E2E Soldout %'`;
    await sql`update site_settings set soldout_hide_days = 90 where id = 'store'`;
  });

  test("is protected by the cron secret", async ({ request }) => {
    expect((await request.get(`${BASE}/api/cron/maintenance`)).status()).toBe(401);
    expect((await request.get(`${BASE}/api/cron/maintenance`, { headers: { Authorization: "Bearer nope" } })).status()).toBe(401);
  });

  test("hides a product that has been sold out for longer than the chosen days – and only that one", async ({ request }) => {
    const old = await soldOutProduct("E2E Soldout Old", 200);
    const fresh = await soldOutProduct("E2E Soldout Fresh", 5);
    await sql`update site_settings set soldout_hide_days = 90 where id = 'store'`;
    const res = await request.get(`${BASE}/api/cron/maintenance?force=1`, { headers: auth });
    expect(res.status()).toBe(200);
    expect(await statusOf(old)).toBe("archived");
    expect(await statusOf(fresh), "recently sold out stays visible").toBe("published");
  });

  test("0 days means keep sold-out products forever", async ({ request }) => {
    const old = await soldOutProduct("E2E Soldout Forever", 400);
    await sql`update site_settings set soldout_hide_days = 0 where id = 'store'`;
    const res = await request.get(`${BASE}/api/cron/maintenance?force=1`, { headers: auth });
    expect(res.status()).toBe(200);
    expect(await statusOf(old)).toBe("published");
  });

  test("a product with any stock left, or a recent order, is never hidden", async ({ request }) => {
    const stocked = await soldOutProduct("E2E Soldout Restocked", 300);
    await sql`update product_variants set stock_quantity = 4 where product_id = ${stocked}`;
    await sql`update site_settings set soldout_hide_days = 30 where id = 'store'`;
    await request.get(`${BASE}/api/cron/maintenance?force=1`, { headers: auth });
    expect(await statusOf(stocked)).toBe("published");
  });

  test("the repeat-call guard skips the work when it ran moments ago", async ({ request }) => {
    await request.get(`${BASE}/api/cron/maintenance?force=1`, { headers: auth });
    const again = await request.get(`${BASE}/api/cron/maintenance`, { headers: auth });
    expect(((await again.json()) as { skipped?: boolean }).skipped).toBe(true);
  });
});

test.describe("request counting", () => {
  test("an address lookup is counted for Geoapify, and junk pings are refused", async ({ request }) => {
    const before = ((await sql`select coalesce(sum(calls), 0)::int as n from api_usage where service = 'geoapify'`) as Array<{ n: number }>)[0].n;
    await request.get(`${BASE}/api/geo/autocomplete?text=${encodeURIComponent(`Gulberg ${Date.now()}`)}`);
    await expect
      .poll(async () => ((await sql`select coalesce(sum(calls), 0)::int as n from api_usage where service = 'geoapify'`) as Array<{ n: number }>)[0].n, { timeout: 15_000 })
      .toBeGreaterThan(before);

    expect((await request.post(`${BASE}/api/usage/ping`, { data: { service: "groq" } })).status()).toBe(400);
    expect((await request.post(`${BASE}/api/usage/ping`, { data: { service: "algolia", ok: true } })).status()).toBe(204);
    expect((await request.post(`${BASE}/api/usage/ping`, { data: { service: "algolia" }, headers: { Origin: "https://evil.example" } })).status()).toBe(403);
  });
});
