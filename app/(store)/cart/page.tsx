"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readCart, writeCart, type CartItem } from "@/lib/cart";
import { syncCartWithServer } from "@/lib/cart-sync";
import { Price } from "../_components/currency";

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState<number | null>(null);
  const [stockNotice, setStockNotice] = useState("");

  useEffect(() => {
    const update = () => setItems(readCart());
    const timer = window.setTimeout(update, 0);
    window.addEventListener("na-cart-change", update);
    window.addEventListener("storage", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("na-cart-change", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  // The bag is a snapshot from whenever each item was added — stock and prices move. Re-check against
  // the live catalogue once the bag has loaded (and again when the tab becomes visible, for a bag
  // left open for hours) and clamp / flag anything that changed. /api/orders re-validates and
  // re-prices again at the moment of purchase regardless, so this is UX, not the security net.
  const itemCount = items.length;
  useEffect(() => {
    if (!itemCount) return;
    const controller = new AbortController();
    const check = () =>
      syncCartWithServer(readCart(), controller.signal).then((result) => {
        if (!result) return;
        if (result.changed) setItems(result.items);
        if (result.notice) setStockNotice(result.notice);
      });
    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [itemCount]);

  useEffect(() => {
    fetch("/api/checkout/options")
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
      <section className="cart-page">
        <header>
          <div>
            <p className="eyebrow">Your selection</p>
            <h1>The bag</h1>
          </div>
          <span>{items.length} pieces</span>
        </header>
        {stockNotice && <p className="cart-stock-notice">{stockNotice}</p>}
        {!items.length ? (
          <div className="cart-empty">
            <h2>Your bag is waiting.</h2>
            <p>Discover the latest from Nure Asmir.</p>
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
                      <Image src="/placeholder.webp" alt="" fill unoptimized sizes="130px" />
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
                  <strong>
                    <Price amount={item.price * item.quantity} />
                  </strong>
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
                <strong>
                  <Price amount={subtotal} />
                </strong>
              </div>
              <div>
                <span>Delivery</span>
                <span>Calculated at checkout</span>
              </div>
              <p>
                {freeDeliveryThreshold
                  ? `Complimentary nationwide delivery above Rs. ${freeDeliveryThreshold.toLocaleString("en-PK")}.`
                  : "Complimentary nationwide delivery on qualifying orders."}
              </p>
              <p className="cart-pkr-note">Orders are charged in PKR.</p>
              <Link className="add-button" href="/checkout">
                Continue to checkout <span>→</span>
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
