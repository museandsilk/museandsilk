import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { Note, PageHeader } from "../../../_ui/ui";
import { ProductEditor } from "../product-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add product" };

export default async function NewProductPage() {
  const list = await db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  return (
    <>
      <p style={{ marginBottom: 10 }}>
        <Link href="/admin/products" className="a-muted">
          ← All products
        </Link>
      </p>
      <PageHeader title="Add a product" intro="Fill in the four sections, then press Add product. Nothing is shown to customers until you say so." />
      {list.length ? (
        <ProductEditor categories={list} />
      ) : (
        <Note tone="warn">
          You need at least one category first (for example “Shirts”). <Link href="/admin/collections" style={{ textDecoration: "underline", fontWeight: 600 }}>Add a category</Link>, then come back.
        </Note>
      )}
    </>
  );
}
