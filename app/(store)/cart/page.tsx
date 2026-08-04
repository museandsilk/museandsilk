"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StoreHeader } from "@/app/(store)/_components/store-components";
import { readCart, writeCart, type CartItem } from "@/lib/cart";

const money = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState<number | null>(null);
  const [stockNotice, setStockNotice] = useState("");

  useEffect(() => {
    const update = () => setItems(readCart());
    const timer = window.setTimeout(update, 0);
    window.addEventListener("muse-cart-change", update);
    window.addEventListener("storage", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("muse-cart-change", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  // Stock in the cart is a snapshot from whenever each item was added — it can go stale (someone
  // else bought the last one, or the admin adjusted stock). Re-check against the live database
  // once the cart has loaded, and clamp/flag anything that changed. /api/orders re-validates
  // again at the moment of purchase regardless, so this is a UX improvement, not the security net.
  useEffect(() => {
    if (!items.length) return;
    const variantIds = items.map((item) => item.variantId);
    fetch("/api/cart-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantIds }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { availability?: { variantId: string; available: number }[] } | null) => {
        if (!data?.availability) return;
        const availableById = new Map(data.availability.map((entry) => [entry.variantId, entry.available]));
        let changed = false;
        const removedNames: string[] = [];
        const reducedNames: string[] = [];
        const next = items
          .map((item) => {
            const available = availableById.get(item.variantId);
            if (available === undefined) return item;
            if (available !== item.available) changed = true;
            if (item.quantity > available) {
              changed = true;
              if (available < 1) removedNames.push(item.name);
              else reducedNames.push(item.name);
            }
            return { ...item, available, quantity: Math.min(item.quantity, available) };
          })
          .filter((item) => item.quantity > 0);
        if (changed) {
          setItems(next);
          writeCart(next);
          const notes = [
            removedNames.length && `${removedNames.join(", ")} sold out and ${removedNames.length > 1 ? "were" : "was"} removed from your bag.`,
            reducedNames.length && `Stock changed for ${reducedNames.join(", ")} — quantity adjusted.`,
          ].filter(Boolean);
          setStockNotice(notes.join(" "));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  useEffect(() => {
    fetch("/api/checkout/options", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.settings?.freeDeliveryThreshold) setFreeDeliveryThreshold(data.settings.freeDeliveryThreshold);
      })
      .catch(() => {});
  }, []);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);

  function update(variantId: string, quantity: number) {
    const next =
      quantity < 1
        ? items.filter((item) => item.variantId !== variantId)
        : items.map((item) =>
            item.variantId === variantId ? { ...item, quantity: Math.min(item.available ?? 10, quantity) } : item,
          );
    setItems(next);
    writeCart(next);
  }

  return (
    <main>
      <StoreHeader />
      <section className="cart-page">
        <header>
          <p className="eyebrow">Your selection</p>
          <h1>The bag</h1>
          <span>{items.length} pieces</span>
        </header>
        {stockNotice && <p className="cart-stock-notice">{stockNotice}</p>}
        {!items.length ? (
          <div className="cart-empty">
            <h2>Your bag is waiting.</h2>
            <p>Discover the first edit of scarves, bandanas and eyewear.</p>
            <Link className="button button-dark" href="/shop">
              Explore the collection
            </Link>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="cart-lines">
              {items.map((item) => (
                <article key={item.variantId}>
                  <div className="cart-image">
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt="" fill sizes="130px" />
                    ) : (
                      <Image src="/category-still-life.webp" alt="" fill unoptimized sizes="130px" />
                    )}
                  </div>
                  <div>
                    <p className="eyebrow">{item.variantName}</p>
                    <Link href={`/products/${item.slug}`}>{item.name}</Link>
                    <small>SKU {item.sku}</small>
                    <div className="quantity-control">
                      <button onClick={() => update(item.variantId, item.quantity - 1)} aria-label="Decrease quantity">
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        onClick={() => update(item.variantId, item.quantity + 1)}
                        aria-label="Increase quantity"
                        disabled={typeof item.available === "number" && item.quantity >= item.available}
                      >
                        +
                      </button>
                    </div>
                    {typeof item.available === "number" && item.available < 5 && (
                      <small className="stock-badge stock-badge-low">Only {item.available} left in stock</small>
                    )}
                  </div>
                  <strong>{money.format(item.price * item.quantity)}</strong>
                  <button className="cart-remove" onClick={() => update(item.variantId, 0)}>
                    Remove
                  </button>
                </article>
              ))}
            </div>
            <aside className="cart-summary">
              <p className="eyebrow">Order summary</p>
              <div>
                <span>Subtotal</span>
                <strong>{money.format(subtotal)}</strong>
              </div>
              <div>
                <span>Delivery</span>
                <span>Calculated at checkout</span>
              </div>
              <p>
                {freeDeliveryThreshold
                  ? `Complimentary nationwide delivery above PKR ${freeDeliveryThreshold.toLocaleString("en-PK")}.`
                  : "Complimentary nationwide delivery on qualifying orders."}
              </p>
              <Link className="add-button" href="/checkout">
                Continue to checkout <span>→︎</span>
              </Link>
              <Link href="/shop" className="text-link">
                Continue shopping
              </Link>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
