import { asc } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { ProductsManager } from "./products-manager";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const categoryRows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return <ProductsManager categories={categoryRows} />;
}
