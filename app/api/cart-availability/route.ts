import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { productVariants } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Public, read-only stock check for the items already sitting in a visitor's cart (cart is
 * client-side/localStorage only, so there's no server session to look this up from). The cart and
 * checkout pages call this on load to catch stock that changed — sold out, or reduced — since the
 * item was originally added; the actual authoritative check still happens again at order creation
 * in /api/orders.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const variantIds = Array.isArray(body?.variantIds) ? body.variantIds.filter((id: unknown) => typeof id === "string") : [];
  if (!variantIds.length || variantIds.length > 50) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const rows = await db
    .select({
      id: productVariants.id,
      stockQuantity: productVariants.stockQuantity,
      reservedQuantity: productVariants.reservedQuantity,
      status: productVariants.status,
    })
    .from(productVariants)
    .where(inArray(productVariants.id, variantIds));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const availability = variantIds.map((id: string) => {
    const row = byId.get(id);
    const available = row && row.status === "active" ? Math.max(0, row.stockQuantity - row.reservedQuantity) : 0;
    return { variantId: id, available };
  });

  return Response.json({ availability });
}
