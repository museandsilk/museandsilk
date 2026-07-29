import { asc, ne } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { CollectionManager } from "./collection-manager";

export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage() {
  const productRows = await db
    .select({ id: products.id, name: products.name, slug: products.slug, status: products.status })
    .from(products)
    .where(ne(products.status, "archived"))
    .orderBy(asc(products.name));

  return <CollectionManager products={productRows} />;
}
