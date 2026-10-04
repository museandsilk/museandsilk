import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveryZones, productVariants, products, siteSettings } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { isPostexConfigured } from "@/lib/postex";
import { postexAutoBookSince } from "@/lib/postex-booking";

export const dynamic = "force-dynamic";

/** Everything the "Place order for customer" form needs in one call: delivery zones, the free-delivery
 * threshold, and every sellable variant (published product + active variant) with live availability. */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [zones, settingsRows, variants] = await Promise.all([
    db
      .select({ id: deliveryZones.id, name: deliveryZones.name, deliveryCharge: deliveryZones.deliveryCharge, estimatedDaysMin: deliveryZones.estimatedDaysMin, estimatedDaysMax: deliveryZones.estimatedDaysMax })
      .from(deliveryZones)
      .where(eq(deliveryZones.active, true))
      .orderBy(asc(deliveryZones.sortOrder)),
    db.select({ freeDeliveryThreshold: siteSettings.freeDeliveryThreshold }).from(siteSettings).where(eq(siteSettings.id, "store")).limit(1),
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        productName: products.name,
        variantName: productVariants.name,
        price: productVariants.price,
        stockQuantity: productVariants.stockQuantity,
        reservedQuantity: productVariants.reservedQuantity,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(products.status, "published"), eq(productVariants.status, "active")))
      .orderBy(asc(products.name), asc(productVariants.name)),
  ]);

  return Response.json({
    zones,
    // Whether orders placed here are booked with PostEx automatically (courier configured + auto switch on).
    autoCourierBooking: isPostexConfigured() && Boolean(postexAutoBookSince()),
    freeDeliveryThreshold: settingsRows[0]?.freeDeliveryThreshold ?? 4000,
    // Same sellable rule resolveOrder enforces on submit: published product + active variant.
    variants: variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      productName: variant.productName,
      variantName: variant.variantName,
      price: variant.price,
      available: Math.max(0, variant.stockQuantity - variant.reservedQuantity),
    })),
  });
}
