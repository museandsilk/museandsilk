import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveryZones, productVariants, products } from "@/db/schema";
import { MAX_BULK_ORDERS, MAX_ITEMS_PER_ORDER } from "@/lib/admin-order-placement";

const PROVINCES = ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Jammu and Kashmir"];

/** Builds the contents of order_place_template.json from the live store — the zone names and SKUs in
 * the examples are real ones — so a copy edited from it works as-is. Fields starting with "_" are
 * documentation the importer ignores. */
export async function buildOrderTemplate() {
  const [zones, variants] = await Promise.all([
    db.select({ name: deliveryZones.name }).from(deliveryZones).where(eq(deliveryZones.active, true)).orderBy(asc(deliveryZones.sortOrder)),
    db
      .select({ sku: productVariants.sku, productName: products.name, variantName: productVariants.name })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(products.status, "published"), eq(productVariants.status, "active"), sql`${productVariants.stockQuantity} - ${productVariants.reservedQuantity} > 0`))
      // Most-available first, three of them: the two example orders must not between them ask for more
      // of one product than is on the shelf, or the template would fail its own pre-placement check.
      .orderBy(sql`(${productVariants.stockQuantity} - ${productVariants.reservedQuantity}) desc`, asc(products.name))
      .limit(3),
  ]);

  const zoneName = zones[0]?.name ?? "YOUR DELIVERY ZONE NAME";
  const skuA = variants[0]?.sku ?? "YOUR-SKU-1";
  const skuB = variants[1]?.sku ?? "YOUR-SKU-2";
  const skuC = variants[2]?.sku ?? "YOUR-SKU-3";

  return {
    _readme: [
      "Bulk order template for the Nure Asmir admin (Orders > Bulk import). Save it, edit it, then upload it.",
      "Every order below is placed as CONFIRMED, on the customer's behalf. Delete the two examples and add your own.",
      `Up to ${MAX_BULK_ORDERS} orders per file, and up to ${MAX_ITEMS_PER_ORDER} items per order. You'll see a full check of every order before anything is placed.`,
      "Required per order: customerName, customerPhone, city, province, address, zone, paymentMethod, items.",
      "Optional per order: customerEmail, paymentStatus, deliveryCharge, discount, notes.",
      'zone: the delivery zone name, exactly as listed in "_allowedZones" below (case does not matter).',
      'paymentMethod: "cod" or "bank_deposit".  paymentStatus: "pending" (default) or "paid" (use "paid" if you already received the money, so the courier collects nothing).',
      "deliveryCharge: whole PKR. Leave it out to use the zone's normal charge (free above the free-delivery threshold). Use 0 for free delivery.",
      "discount: whole PKR taken off the order total. Leave it out for none.",
      "items: each line needs a sku (the product variant's SKU) and a quantity (whole number). The same SKU on two lines is added together.",
      "Numbers must be real numbers (1200), not text (\"1200\"). Any field starting with an underscore is ignored.",
    ],
    _allowedZones: zones.map((zone) => zone.name),
    _allowedProvinces: PROVINCES,
    orders: [
      {
        customerName: "Ayesha Khan",
        customerPhone: "03001234567",
        customerEmail: "ayesha@example.com",
        city: "Lahore",
        province: "Punjab",
        address: "House 12, Street 4, DHA Phase 5",
        zone: zoneName,
        paymentMethod: "cod",
        notes: "Please call before delivery",
        items: [{ sku: skuA, quantity: 1 }],
      },
      {
        customerName: "Bilal Ahmed",
        customerPhone: "+923331234567",
        city: "Karachi",
        province: "Sindh",
        address: "Flat 7, Block B, Clifton",
        zone: zoneName,
        paymentMethod: "bank_deposit",
        paymentStatus: "paid",
        deliveryCharge: 0,
        discount: 100,
        items: [
          { sku: skuB, quantity: 1 },
          { sku: skuC, quantity: 1 },
        ],
      },
    ],
  };
}
