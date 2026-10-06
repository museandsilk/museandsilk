import { expect, test } from "@playwright/test";
import { fingerprintOf } from "../../lib/error-log";
import { backendOf, chooseBackend, newObjectKey, STORAGE_LIMITS } from "../../lib/storage";
import { variantKeyFor } from "../../lib/image-variants";

test.describe("two picture stores", () => {
  test("an R2 key is recognised by its prefix, and picture sizes keep the same prefix", () => {
    const r2 = newObjectKey("products", "image/webp", "r2");
    const neon = newObjectKey("products", "image/webp", "neon");
    expect(r2).toMatch(/^r2\/products\/[0-9a-f-]{36}\.webp$/);
    expect(neon).toMatch(/^products\/[0-9a-f-]{36}\.webp$/);
    expect(backendOf(r2)).toBe("r2");
    expect(backendOf(neon)).toBe("neon");
    expect(backendOf(variantKeyFor(r2, 640))).toBe("r2");
    expect(backendOf(variantKeyFor(neon, 640))).toBe("neon");
  });

  test("private files never leave Neon, and without an R2 connection everything goes to Neon", () => {
    expect(chooseBackend("payment-proofs/abc")).toBe("neon");
    expect(chooseBackend("refunds/abc")).toBe("neon");
    expect(chooseBackend("products")).toBe("neon"); // no R2 binding in this process
    expect(newObjectKey("payment-proofs/x", "image/png")).toMatch(/^payment-proofs\//);
  });

  test("the two free allowances add up to about 15 GB", () => {
    expect((STORAGE_LIMITS.neon + STORAGE_LIMITS.r2) / 1024 ** 3).toBe(15);
  });
});

test.describe("error grouping", () => {
  test("the same error with different numbers or ids is one fingerprint; different places are not", () => {
    const a = fingerprintOf("route", "Order 1234 failed for 0a1b2c3d-1111-2222-3333-444455556666", "/api/orders");
    const b = fingerprintOf("route", "Order 99 failed for ffffffff-1111-2222-3333-444455556666", "/api/orders");
    const c = fingerprintOf("route", "Order 99 failed for ffffffff-1111-2222-3333-444455556666", "/api/other");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
