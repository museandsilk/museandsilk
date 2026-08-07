import type { Metadata } from "next";
import Image from "next/image";
import { StoreHeader } from "../_components/store-components";
import { StoreFooter } from "../_components/store-footer";
import { ShopGrid } from "./shop-grid";
import { getCatalogProducts } from "@/lib/commerce";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Shop scarves, bandanas and eyewear",
  description: "Explore the complete Muse & Silk edit of scarves, bandanas and sunglasses.",
  alternates: { canonical: "/shop" },
};

export default async function ShopPage() {
  const products = await getCatalogProducts();
  return (
    <main className="page-fade-in">
      <StoreHeader theme="dark" />
      <section className="collection-hero">
        <Image src="/category-still-life.webp" alt="" fill priority sizes="100vw" />
        <div />
        <p className="eyebrow">The complete edit</p>
        <h1>Shop all pieces</h1>
      </section>
      <ShopGrid products={products} />

      <StoreFooter />
    </main>
  );
}
