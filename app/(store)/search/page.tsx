import { getCatalogProducts } from "@/lib/commerce";
import { StoreHeader, ProductCard } from "../_components/store-components";
import { StoreFooter } from "../_components/store-footer";

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

      <StoreFooter />
    </main>
  );
}
