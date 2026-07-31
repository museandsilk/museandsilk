"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StoreHeader } from "@/app/(store)/_components/store-components";
import { readCart, writeCart, type CartItem } from "@/lib/cart";

const money = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);

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

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);

  function update(variantId: string, quantity: number) {
    const next =
      quantity < 1
        ? items.filter((item) => item.variantId !== variantId)
        : items.map((item) => (item.variantId === variantId ? { ...item, quantity: Math.min(10, quantity) } : item));
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
                      <Image src={item.imageUrl} alt="" fill unoptimized sizes="130px" />
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
                      <button onClick={() => update(item.variantId, item.quantity + 1)} aria-label="Increase quantity">
                        +
                      </button>
                    </div>
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
              <p>Complimentary nationwide delivery above PKR 12,000.</p>
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
