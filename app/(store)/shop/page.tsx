import type { Metadata } from "next";
import { StoreFooter } from "../_components/store-footer";
import { ShopGrid } from "./shop-grid";
import { getActiveCategories, getCatalogProducts } from "@/lib/commerce";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Shop all — new arrivals",
  description: "Shop the full Nure Asmir range: shalwar kameez, shirts, pants and leather accessories.",
  alternates: { canonical: "/shop" },
};

export default async function ShopPage() {
  const [products, categories] = await Promise.all([getCatalogProducts(), getActiveCategories()]);
  return (
    <main className="page-fade-in">
      <header className="listing-head">
        <h1 className="page-title">New arrivals</h1>
      </header>
      <ShopGrid products={products} categories={categories.map((category) => ({ slug: category.slug, name: category.name }))} />
      <StoreFooter />
    </main>
  );
}
