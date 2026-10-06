import fs from "node:fs";
import { expect, test } from "@playwright/test";

// The admin pages show product thumbnails from their OWN address (/cdn/products/…), so the admin Worker must contain the picture route.
// It was once left out of the admin build and every admin thumbnail returned 404.
test("the admin build keeps the picture route, and the store build still leaves admin code out", () => {
  const text = fs.readFileSync("scripts/build-target.mjs", "utf8");
  const start = text.indexOf("const EXCLUDE = {");
  const storeAt = text.indexOf("  store: [", start);
  const adminAt = text.indexOf("  admin: [", start);
  expect(start).toBeGreaterThan(-1);
  expect(storeAt).toBeGreaterThan(start);
  expect(adminAt).toBeGreaterThan(storeAt);
  const store = text.slice(storeAt, adminAt);
  const admin = text.slice(adminAt, text.indexOf("}[target]", adminAt));
  expect(admin).not.toContain('"app/cdn"');
  expect(admin).toContain('"app/(store)"');
  expect(store).toContain('"app/admin"');
  expect(store).not.toContain('"app/cdn"');
});
