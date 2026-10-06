import type { Metadata } from "next";
import { getCatalogProducts, toCard, type CatalogProduct } from "@/lib/commerce";
import { searchProductIds } from "@/lib/search/server";
import { ProductCard } from "../_components/store-components";
import { StoreFooter } from "../_components/store-footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

/** Typo-tolerant search through Algolia, then mapped back onto the live catalogue so cards always show
 * current stock and prices. If Algolia's free allowance runs out (or it is unreachable) the built-in
 * MiniSearch engine answers instead – see lib/search/server.ts – so search never goes dark. */
async function searchProducts(query: string, catalog: CatalogProduct[]): Promise<CatalogProduct[]> {
  const { ids } = await searchProductIds(query, 48).catch(() => ({ ids: [] as string[] }));
  const byId = new Map(catalog.map((product) => [product.id, product]));
  const found = ids.map((id) => byId.get(id)).filter((product): product is CatalogProduct => !!product);
  if (found.length) return found;
  const needle = query.toLowerCase();
  return catalog.filter((product) => `${product.name} ${product.type} ${product.color} ${product.description ?? ""} ${product.shortDescription ?? ""} ${product.sku}`.toLowerCase().includes(needle));
}

const SEARCH_LIMIT = 48;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = String((await searchParams).q ?? "").trim().slice(0, 100);
  const catalog = await getCatalogProducts();
  const found = query ? await searchProducts(query, catalog) : [];
  // Never paint hundreds of cards at once: the first 48 best matches, and a hint to narrow the search.
  const results = found.slice(0, SEARCH_LIMIT);

  return (
    <main className="page-fade-in">
      <section className="search-page">
        <header>
          <h1 className="page-title">{query ? `Results for “${query}”` : "Search"}</h1>
          <p className="result-count">{query ? (found.length > results.length ? `Showing the first ${results.length} of ${found.length} products – try a more specific word` : `${found.length} ${found.length === 1 ? "product" : "products"}`) : "Use the search icon above to find a product."}</p>
        </header>
        {results.length > 0 && (
          <div className="product-grid">
            {results.map((product) => (
              <ProductCard key={product.slug} product={toCard(product)} />
            ))}
          </div>
        )}
        {query && !results.length && (
          <div className="cart-empty">
            <h2>No exact match.</h2>
            <p>Try a category, colour or product name.</p>
          </div>
        )}
      </section>
      <StoreFooter />
    </main>
  );
}
