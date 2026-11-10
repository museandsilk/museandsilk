import type { Metadata } from "next";
import { BulkImport } from "./bulk-import";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add many products — Muse & Silk Admin", robots: { index: false, follow: false } };

export default function BulkImportPage() {
  return <BulkImport />;
}
