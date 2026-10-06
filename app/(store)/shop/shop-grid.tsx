"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "../_components/store-components";
import type { CardProduct } from "@/lib/commerce";

/**
 * `categories` drives the filter tabs on /shop ("All" plus one tab per live category). Collection
 * pages (/collections/[slug]) are already scoped to one category, so they omit it and the tab bar
 * is hidden.
 */
export function ShopGrid({
  products,
  categories,
}: {
  products: CardProduct[];
  categories?: Array<{ slug: string; name: string }>;
}) {
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const showTabs = !!categories?.length;

  const visible = useMemo(() => {
    const filtered = !showTabs || category === "all" ? [...products] : products.filter((product) => product.category === category);
    if (sort === "low") filtered.sort((a, b) => a.price - b.price);
    if (sort === "high") filtered.sort((a, b) => b.price - a.price);
    return filtered;
  }, [category, products, sort, showTabs]);

  return (
    <section className="shop-shell">
      <div className="shop-toolbar">
        {showTabs ? (
          <div className="filter-tabs" role="tablist" aria-label="Filter products by category">
            {[{ slug: "all", name: "All" }, ...(categories ?? [])].map((item) => (
              <button
                key={item.slug}
                type="button"
                role="tab"
                aria-selected={category === item.slug}
                className={category === item.slug ? "active" : ""}
                onClick={() => setCategory(item.slug)}
              >
                {item.name}
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
      <p className="result-count">{visible.length} {visible.length === 1 ? "product" : "products"}</p>
      <div className="product-grid shop-grid">
        {visible.map((product, index) => (
          <ProductCard key={product.slug} product={product} priority={index < 4} sizes="(max-width: 700px) 46vw, (max-width: 1100px) 33vw, 25vw" />
        ))}
      </div>
      {!visible.length && <p className="result-count">Nothing here yet — check back soon.</p>}
    </section>
  );
}
