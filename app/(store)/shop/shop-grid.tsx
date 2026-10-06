"use client";

import { useMemo, useRef, useState } from "react";
import { ProductCard } from "../_components/store-components";
import type { CardProduct } from "@/lib/commerce";

type Sort = "newest" | "low" | "high";
type Loaded = { products: CardProduct[]; total: number };

/**
 * `products` is the first page, rendered on the server (so the page is instant and cacheable).
 * `categories` drives the filter tabs on /shop ("All" plus one tab per live category). A collection page for one category
 * passes `scopeCategory` instead (no tabs). Everything past the first page – other tabs, sorting, "Show more" – comes from
 * `/api/catalog/page`, 24 products at a time and cached at the edge, so a big catalogue never loads all at once.
 * An owner-curated collection (neither prop) is small and is simply shown whole.
 */
export function ShopGrid({
  products,
  total,
  categories,
  scopeCategory,
}: {
  products: CardProduct[];
  total?: number;
  categories?: Array<{ slug: string; name: string }>;
  scopeCategory?: string;
}) {
  const showTabs = !!categories?.length;
  const paged = showTabs || !!scopeCategory;
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [items, setItems] = useState(products);
  const [count, setCount] = useState(total ?? products.length);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const firstPages = useRef(new Map<string, Loaded>([["all|newest", { products, total: total ?? products.length }]]));
  const request = useRef(0);

  async function fetchPage(cat: string, order: Sort, pageNumber: number): Promise<Loaded> {
    const scope = scopeCategory ?? cat;
    const response = await fetch(`/api/catalog/page?cat=${encodeURIComponent(scope)}&sort=${order}&page=${pageNumber}`);
    if (!response.ok) throw new Error(String(response.status));
    return (await response.json()) as Loaded;
  }

  async function show(cat: string, order: Sort) {
    setCategory(cat);
    setSort(order);
    setFailed(false);
    if (!paged) return;
    const id = ++request.current;
    const key = `${scopeCategory ? "all" : cat}|${order}`;
    const cached = firstPages.current.get(key);
    if (cached) {
      setItems(cached.products);
      setCount(cached.total);
      setPage(1);
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const loaded = await fetchPage(cat, order, 1);
      if (id !== request.current) return;
      firstPages.current.set(key, loaded);
      setItems(loaded.products);
      setCount(loaded.total);
      setPage(1);
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  async function more() {
    if (busy) return;
    const id = ++request.current;
    setBusy(true);
    setFailed(false);
    try {
      const loaded = await fetchPage(category, sort, page + 1);
      if (id !== request.current) return;
      setItems((current) => {
        const seen = new Set(current.map((product) => product.id));
        return [...current, ...loaded.products.filter((product) => !seen.has(product.id))];
      });
      setCount(loaded.total);
      setPage(page + 1);
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  // A small owner-made collection is not paged, so it is sorted here; paged lists are sorted by the server.
  const visible = useMemo(() => {
    if (paged) return items;
    const sorted = [...items];
    if (sort === "low") sorted.sort((a, b) => a.price - b.price);
    if (sort === "high") sorted.sort((a, b) => b.price - a.price);
    return sorted;
  }, [items, paged, sort]);

  return (
    <section className="shop-shell">
      <div className="shop-toolbar">
        {showTabs ? (
          <div className="filter-tabs" role="tablist" aria-label="Filter products by category">
            {[{ slug: "all", name: "All" }, ...(categories ?? [])].map((item) => (
              <button key={item.slug} type="button" role="tab" aria-selected={category === item.slug} className={category === item.slug ? "active" : ""} onClick={() => void show(item.slug, sort)}>
                {item.name}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <label>
          Sort{" "}
          <select value={sort} onChange={(event) => void show(category, event.target.value as Sort)}>
            <option value="newest">Newest first</option>
            <option value="low">Price, low to high</option>
            <option value="high">Price, high to low</option>
          </select>
        </label>
      </div>
      <p className="result-count" aria-live="polite">
        {paged && count > visible.length ? `Showing ${visible.length} of ${count} products` : `${count} ${count === 1 ? "product" : "products"}`}
      </p>
      <div className="product-grid shop-grid" style={busy ? { opacity: 0.6, transition: "opacity .15s" } : undefined} aria-busy={busy}>
        {visible.map((product, index) => (
          <ProductCard key={product.slug} product={product} priority={index < 4} sizes="(max-width: 700px) 46vw, (max-width: 1100px) 33vw, 25vw" />
        ))}
      </div>
      {!visible.length && !busy && <p className="result-count">Nothing here yet — check back soon.</p>}
      {failed && (
        <p className="result-count" role="alert">
          Could not load products. Please check your internet and try again.
        </p>
      )}
      {paged && count > visible.length && (
        <div style={{ display: "flex", justifyContent: "center", padding: "28px 0 8px" }}>
          <button type="button" className="button button-dark" onClick={() => void more()} disabled={busy} aria-busy={busy}>
            {busy ? "Loading…" : "Show more"}
          </button>
        </div>
      )}
    </section>
  );
}
