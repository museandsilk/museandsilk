import { eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { discountCodes } from "@/db/schema";

export type DiscountCodeRow = typeof discountCodes.$inferSelect;

export type CouponCheckResult =
  | { ok: true; coupon: DiscountCodeRow }
  | { ok: false; error: string };

/** Looks up a coupon by code and checks it against everything EXCEPT the redemption-count race
 * (that's guarded separately, atomically, at the point of actually consuming it in the order
 * transaction — this function is safe to call read-only for a checkout preview). */
export async function checkCoupon(
  database: typeof Db,
  rawCode: string,
  subtotal: number,
): Promise<CouponCheckResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a coupon code." };

  const [coupon] = await database.select().from(discountCodes).where(eq(discountCodes.code, code)).limit(1);
  if (!coupon) return { ok: false, error: "This coupon code isn't valid." };
  if (!coupon.active) return { ok: false, error: "This coupon is no longer active." };

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) return { ok: false, error: "This coupon isn't active yet." };
  if (coupon.expiresAt && now > coupon.expiresAt) return { ok: false, error: "This coupon has expired." };
  if (subtotal < coupon.minOrderAmount) {
    return {
      ok: false,
      error: `This coupon requires a minimum order of PKR ${coupon.minOrderAmount.toLocaleString("en-PK")}.`,
    };
  }
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { ok: false, error: "This coupon has reached its redemption limit." };
  }

  return { ok: true, coupon };
}

/** Computes the discount amount in integer PKR for a validated coupon against a given base
 * (subtotal, or subtotal+delivery when the coupon applies to delivery too). Never exceeds the base. */
export function computeDiscountAmount(coupon: DiscountCodeRow, subtotal: number, deliveryCharge: number): number {
  const base = coupon.appliesToDelivery ? subtotal + deliveryCharge : subtotal;
  let amount: number;
  if (coupon.type === "percentage") {
    amount = Math.round((base * coupon.value) / 100);
    if (coupon.maxDiscountAmount !== null) amount = Math.min(amount, coupon.maxDiscountAmount);
  } else {
    amount = coupon.value;
  }
  return Math.max(0, Math.min(amount, base));
}
