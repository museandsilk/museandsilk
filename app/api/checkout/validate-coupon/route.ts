import { db } from "@/db";
import { checkCoupon, computeDiscountAmount } from "@/lib/coupons";

export const dynamic = "force-dynamic";

/**
 * Read-only coupon preview for the checkout page — does NOT consume a redemption slot. The
 * authoritative check-and-consume happens atomically inside POST /api/orders at the moment the
 * order is actually placed, so a coupon that looks valid here can still be rejected there if it
 * expired or hit its redemption cap in between (rare, but handled).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const code = String(body.code ?? "").trim();
  const subtotal = Number(body.subtotal ?? 0);
  const deliveryCharge = Number(body.deliveryCharge ?? 0);
  if (!code || !Number.isFinite(subtotal) || subtotal < 0) {
    return Response.json({ error: "Enter a coupon code." }, { status: 400 });
  }

  const result = await checkCoupon(db, code, subtotal);
  if (!result.ok) {
    return Response.json({ valid: false, error: result.error }, { status: 400 });
  }

  const discount = computeDiscountAmount(result.coupon, subtotal, deliveryCharge);
  return Response.json({
    valid: true,
    code: result.coupon.code,
    discount,
    description: result.coupon.description ?? "",
  });
}
