import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { StoreHeader } from "../_components/store-components";
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
      <StoreHeader />
      <section className="collection-hero">
        <Image src="/category-still-life.webp" alt="" fill priority sizes="100vw" />
        <div />
        <p className="eyebrow">The complete edit</p>
        <h1>Shop all pieces</h1>
      </section>
      <ShopGrid products={products} />

      <footer className="footer">
        <div className="footer-brand">
          <Link href="/" className="wordmark">
            MUSE <i>&amp;</i> SILK
          </Link>
          <p>Modern accessories, composed with intention.</p>
        </div>
        <div className="footer-links">
          <div>
            <h3>Shop</h3>
            <Link href="/collections/scarves">Scarves</Link>
            <Link href="/collections/bandanas">Bandanas</Link>
            <Link href="/collections/glasses">Eyewear</Link>
            <Link href="/shop">New arrivals</Link>
          </div>
          <div>
            <h3>Service</h3>
            <Link href="/track-order">Track your order</Link>
            <Link href="/policies/shipping">Shipping</Link>
            <Link href="/policies/returns">Returns</Link>
            <Link href="/contact">WhatsApp assistance</Link>
          </div>
          <div>
            <h3>About</h3>
            <Link href="/about">Our story</Link>
            <Link href="/journal">Journal</Link>
            <Link href="/contact">Contact</Link>
            <a href="https://instagram.com" rel="noreferrer">
              Instagram
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Muse &amp; Silk</span>
          <span>Prices in PKR</span>
          <div>
            <Link href="/policies/privacy">Privacy</Link>
            <Link href="/policies/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
