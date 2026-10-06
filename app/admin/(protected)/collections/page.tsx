import { asc, ne } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { CollectionManager } from "./collection-manager";
import { HelpBox } from "../../_ui/client";

export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage() {
  const productRows = await db
    .select({ id: products.id, name: products.name, slug: products.slug, status: products.status })
    .from(products)
    .where(ne(products.status, "archived"))
    .orderBy(asc(products.name));

  return (
    <>
      <HelpBox id="categories">
        <ol>
          <li>Press <strong>New category</strong> and type a name, like “Shirts”.</li>
          <li>Add a picture for it — customers see it on your home page and category page.</li>
          <li>When you add a product, pick its category. For a hand-picked list (like “Eid Edit”), use <strong>Collections</strong>.</li>
        </ol>
      </HelpBox>
      <CollectionManager products={productRows} />
    </>
  );
}
