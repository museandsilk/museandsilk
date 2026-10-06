import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { PageHeader } from "../../../_ui/ui";
import { BulkUpload } from "./bulk-upload";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add many products" };

export default async function BulkPage() {
  const list = await db.select({ name: categories.name }).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  return (
    <>
      <p style={{ marginBottom: 10 }}>
        <Link href="/admin/products" className="a-muted">
          ← All products
        </Link>
      </p>
      <PageHeader title="Add many products with Excel" intro="Fill in one sheet instead of typing each product. Works with Excel and with Google Sheets." />
      <BulkUpload categoryNames={list.map((row) => row.name)} />
    </>
  );
}
