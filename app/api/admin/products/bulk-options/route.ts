import { asc } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, productVariants } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

// Read-only lookups for "Add many with Excel": the categories a sheet may use, and the web addresses /
// product codes already taken (so the Check step can show "already in your store" before anything is written).
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [categoryRows, productRows, variantRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name, slug: categories.slug, status: categories.status }).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select({ slug: products.slug, typeLabel: products.typeLabel, badge: products.badge }).from(products),
    db.select({ sku: productVariants.sku }).from(productVariants),
  ]);

  const types = [...new Set(productRows.map((row) => row.typeLabel).filter(Boolean))].sort().slice(0, 200);
  const labels = [...new Set(["New", "Sale", "Limited", ...productRows.map((row) => row.badge ?? "").filter(Boolean)])].slice(0, 50);

  return Response.json({
    categories: categoryRows,
    existingSlugs: productRows.map((row) => row.slug),
    existingSkus: variantRows.map((row) => row.sku),
    types,
    labels,
  });
}
