import fs from "node:fs";
import { expect, test } from "@playwright/test";

// The admin pages show product thumbnails from their OWN address (/cdn/products/…), so the admin Worker must contain the picture route.
// It was once left out of the admin build and every admin thumbnail returned 404.
test("the admin build keeps the picture route, and the store build still leaves admin code out", () => {
  const text = fs.readFileSync("scripts/build-target.mjs", "utf8");
  const block = (name: "store" | "admin") => {
    const match = new RegExp(`\n  ${name}: \[([\s\S]*?)\],?\n`).exec(text);
    return match?.[1] ?? "";
  };
  expect(block("admin")).not.toContain('"app/cdn"');
  expect(block("admin")).toContain('"app/(store)"');
  expect(block("store")).toContain('"app/admin"');
  expect(block("store")).not.toContain('"app/cdn"');
});
