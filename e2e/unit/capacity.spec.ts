import { expect, test } from "@playwright/test";
import { averagePhotoBytes, predict, type Measured } from "../../lib/capacity";

const GB = 1024 ** 3;
const base: Measured = {
  neon: { used: 1 * GB, limit: 5 * GB },
  r2: { used: 2 * GB, limit: 10 * GB },
  photoCount: 1000,
  photoBytes: 120 * 1024 * 1000,
  storedBytes: 3 * GB,
  shrinkableCount: 0,
  shrinkableBytes: 0,
  db: { used: 100 * 1024 ** 2, limit: 512 * 1024 ** 2 },
  orders: 400,
  products: 80,
  emailsPerDay: 100,
  searchesPerMonth: 10_000,
  lookupsPerDay: 3000,
};

test.describe("capacity forecast", () => {
  test("photo room is the free space of both stores divided by what one photo really takes", () => {
    const result = predict(base);
    const perPhoto = (3 * GB) / 1000;
    expect(result.photos.perPhoto).toBe(Math.round(perPhoto));
    expect(result.photos.more).toBe(Math.floor((12 * GB) / perPhoto));
    expect(result.photos.moreAfterShrinking).toBe(result.photos.more);
  });

  test("shrinking old sold-out photos raises the forecast, never lowers it", () => {
    const shrunk = predict({ ...base, shrinkableCount: 300, shrinkableBytes: 40 * 1024 * 300 });
    expect(shrunk.photos.moreAfterShrinking).toBeGreaterThan(shrunk.photos.more);
  });

  test("with few photos it falls back to the standard estimate, and full stores give zero – never negative", () => {
    expect(averagePhotoBytes({ photoCount: 3, photoBytes: 1, storedBytes: 5 })).toBe(380 * 1024);
    const full = predict({ ...base, neon: { used: 6 * GB, limit: 5 * GB }, r2: { used: 10 * GB, limit: 10 * GB } });
    expect(full.photos.more).toBe(0);
    expect(full.headroom.every((item) => item.remaining >= 0)).toBe(true);
  });

  test("it names what runs out first, and ignores allowances that have a built-in fallback", () => {
    const tight = predict({ ...base, db: { used: 505 * 1024 ** 2, limit: 512 * 1024 ** 2 } });
    expect(tight.weakest?.key).toMatch(/orders|products/);
    const noSearch = predict({ ...base, searchesPerMonth: 100 });
    expect(noSearch.weakest?.key).not.toBe("visits-search");
  });
});
