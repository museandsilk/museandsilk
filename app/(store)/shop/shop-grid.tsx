"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "../_components/store-components";
import type { CatalogProduct } from "@/lib/commerce";

/**
 * `showCategoryFilter` defaults to true for /shop, where "All / Scarves / Bandanas / Eyewear"
 * makes sense across the whole catalog. Collection pages (/collections/[slug]) already scope
 * `products` to a single category via the page's own hero/breadcrumb, so they pass this as false —
 * otherwise the exact same category tabs re-render redundantly underneath a page that's already
 * one specific category (e.g. an "All / Scarves / Bandanas / Eyewear" bar sitting inside Eyewear).
 */
export function ShopGrid({ products, showCategoryFilter = true }: { products: CatalogProduct[]; showCategoryFilter?: boolean }) {
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const visible = useMemo(() => {
    const filtered = !showCategoryFilter || category === "all" ? [...products] : products.filter((product) => product.category === category);
    if (sort === "low") filtered.sort((a, b) => a.price - b.price);
    if (sort === "high") filtered.sort((a, b) => b.price - a.price);
    return filtered;
  }, [category, products, sort, showCategoryFilter]);
  return (
    <section className="shop-shell">
      <div className="shop-toolbar">
        {showCategoryFilter ? (
          <div className="filter-tabs" aria-label="Filter products by category">
            {[
              ["all", "All"],
              ["scarves", "Scarves"],
              ["bandanas", "Bandanas"],
              ["glasses", "Eyewear"],
            ].map(([value, label]) => (
              <button key={value} className={category === value ? "active" : ""} onClick={() => setCategory(value)}>
                {label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <label>
          Sort{" "}
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="featured">Featured</option>
            <option value="low">Price, low to high</option>
            <option value="high">Price, high to low</option>
          </select>
        </label>
      </div>
      <p className="result-count">{visible.length} pieces</p>
      <div className="product-grid shop-grid">
        {visible.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  );
}
