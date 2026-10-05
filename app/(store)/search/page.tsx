import type { Metadata } from "next";
import { algoliasearch } from "algoliasearch";
import { getCatalogProducts, type CatalogProduct } from "@/lib/commerce";
import { ProductCard } from "../_components/store-components";
import { StoreFooter } from "../_components/store-footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

/** Typo-tolerant search through Algolia, then mapped back onto the live catalogue so cards always
 * show current stock and prices. Falls back to a plain substring match if Algolia isn't configured
 * or is unreachable, so search never goes dark. */
async function searchProducts(query: string, catalog: CatalogProduct[]): Promise<CatalogProduct[]> {
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const key = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
  if (appId && key) {
    try {
      const client = algoliasearch(appId, key);
      const { hits } = await client.searchSingleIndex<{ objectID: string }>({
        indexName: process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME || "nure_asmir_products",
        searchParams: { query, hitsPerPage: 48, attributesToRetrieve: ["objectID"] },
      });
      const byId = new Map(catalog.map((product) => [product.id, product]));
      return hits.map((hit) => byId.get(hit.objectID)).filter((product): product is CatalogProduct => !!product);
    } catch (error) {
      console.error("Algolia search failed — falling back to substring match", error);
    }
  }
  const needle = query.toLowerCase();
  return catalog.filter((product) =>
    `${product.name} ${product.type} ${product.color} ${product.description ?? ""} ${product.shortDescription ?? ""} ${product.sku}`
      .toLowerCase()
      .includes(needle),
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = String((await searchParams).q ?? "").trim().slice(0, 100);
  const catalog = await getCatalogProducts();
  const results = query ? await searchProducts(query, catalog) : [];

  return (
    <main className="page-fade-in">
      <section className="search-page">
        <header>
          <h1 className="page-title">{query ? `Results for “${query}”` : "Search"}</h1>
          <p className="result-count">{query ? `${results.length} ${results.length === 1 ? "product" : "products"}` : "Use the search icon above to find a product."}</p>
        </header>
        {results.length > 0 && (
          <div className="product-grid">
            {results.map((product) => (
              <ProductCard key={product.slug} product={product} />
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
