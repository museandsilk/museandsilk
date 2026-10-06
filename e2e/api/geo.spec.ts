import { expect, test } from "@playwright/test";
import { BASE, warmUp } from "../support/helpers";

test.describe("address search (Geoapify behind our own route)", () => {
  test.beforeAll(async ({ request }) => {
    await warmUp(request, ["/api/geo/autocomplete"]);
  });

  test("too-short or junk text never reaches Geoapify and returns an empty list", async ({ request }) => {
    for (const text of ["", "a", "ab", "   ", "%00%00"]) {
      const res = await request.get(`${BASE}/api/geo/autocomplete?text=${text}`);
      expect(res.status()).toBe(200);
      expect(((await res.json()) as { suggestions: unknown[] }).suggestions).toEqual([]);
    }
  });

  test("a real address returns a few cacheable suggestions (and the API key is never sent to the browser)", async ({ request }) => {
    const res = await request.get(`${BASE}/api/geo/autocomplete?text=${encodeURIComponent("Mall of Lahore Tufail Road")}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { suggestions: Array<{ label: string; lat: number; lon: number }>; unavailable?: boolean };
    expect(JSON.stringify(body)).not.toContain("apiKey");
    if (body.unavailable) test.skip(true, "Geoapify not reachable from this machine");
    expect(body.suggestions.length).toBeLessThanOrEqual(5);
    expect(res.headers()["cache-control"]).toContain("s-maxage");
    for (const s of body.suggestions) expect(Number.isFinite(s.lat) && Number.isFinite(s.lon)).toBe(true);
  });
});
