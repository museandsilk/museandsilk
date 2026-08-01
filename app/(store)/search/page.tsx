import Link from "next/link";
import { getCatalogProducts } from "@/lib/commerce";
import { StoreHeader, ProductCard } from "../_components/store-components";
import { Reveal } from "../_components/reveal";

export const revalidate = 300;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = String((await searchParams).q ?? "").trim();
  const catalog = await getCatalogProducts();
  const needle = query.toLowerCase();
  const results = query
    ? catalog.filter((product) =>
        `${product.name} ${product.type} ${product.color} ${product.description ?? ""} ${product.shortDescription ?? ""} ${product.sku}`
          .toLowerCase()
          .includes(needle),
      )
    : [];

  return (
    <main>
      <StoreHeader />
      <section className="search-page">
        <p className="eyebrow">Search the collection</p>
        <h1>{query ? `Results for "${query}"` : "Find your final layer"}</h1>
        <p>{results.length} pieces found</p>
        <div className="product-grid">
          {results.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
        {query && !results.length && (
          <div className="cart-empty">
            <h2>No exact match.</h2>
            <p>Try a category, color or product name.</p>
          </div>
        )}
      </section>

      <Reveal>
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
      </Reveal>
    </main>
  );
}
