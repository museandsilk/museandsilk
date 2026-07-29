"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "../_components/store-components";
import type { CatalogProduct } from "@/lib/commerce";

export function ShopGrid({ products }: { products: CatalogProduct[] }) {
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const visible = useMemo(() => {
    const filtered = category === "all" ? [...products] : products.filter((product) => product.category === category);
    if (sort === "low") filtered.sort((a, b) => a.price - b.price);
    if (sort === "high") filtered.sort((a, b) => b.price - a.price);
    return filtered;
  }, [category, products, sort]);
  return (
    <section className="shop-shell">
      <div className="shop-toolbar">
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
