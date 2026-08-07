"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CatalogProduct, CatalogVariant } from "@/lib/commerce";
import { addCartItem, readCart } from "@/lib/cart";

const money = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });

export function ProductPurchase({
  product,
  variants,
  selectedId,
  onSelectVariant,
}: {
  product: CatalogProduct;
  variants: CatalogVariant[];
  selectedId: string;
  onSelectVariant: (id: string) => void;
}) {
  const router = useRouter();
  // `message` covers the two error states (sold out / already at cap) — an inline line makes
  // sense right there next to the button. A successful add gets its own toast below instead: the
  // old version only ever showed a quiet line of text under the buttons for that too, easy to
  // miss entirely, with no way to act on it without a full page navigation to /cart.
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ variantName: string; price: number } | null>(null);
  const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0];

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function add(buyNow = false) {
    if (selected.available < 1) {
      setMessage("This option is currently sold out.");
      return;
    }
    const quantityBefore = readCart().find((item) => item.variantId === selected.id)?.quantity ?? 0;
    addCartItem({
      variantId: selected.id,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      variantName: selected.name,
      sku: selected.sku,
      price: selected.price,
      quantity: 1,
      imageUrl: product.imageUrl,
      available: selected.available,
    });
    const quantityAfter = readCart().find((item) => item.variantId === selected.id)?.quantity ?? 0;
    if (quantityAfter === quantityBefore) {
      setMessage(`You already have the maximum available (${selected.available}) in your bag.`);
      return;
    }
    setMessage("");
    if (buyNow) {
      router.push("/cart");
      return;
    }
    setToast({ variantName: selected.color, price: selected.price });
  }

  return (
    <div className="purchase-block">
      <div className="choice-row">
        <span>Color</span>
        <strong>{selected.color}</strong>
      </div>
      {selected.available < 1 ? (
        <p className="stock-badge stock-badge-out">Sold out</p>
      ) : selected.available < 5 ? (
        <p className="stock-badge stock-badge-low">Only {selected.available} left in stock</p>
      ) : null}
      <div className="color-options">
        {variants.map((variant, index) => (
          <button
            key={variant.id}
            aria-label={`Choose ${variant.color}`}
            className={selected.id === variant.id ? "active" : ""}
            onClick={() => onSelectVariant(variant.id)}
            disabled={variant.available < 1}
          >
            <i className={`option-${index % 3}`} />
          </button>
        ))}
      </div>
      <button className="add-button" disabled={selected.available < 1} onClick={() => add()}>
        Add to bag{" "}
        <span>
          {selected.compareAtPrice && selected.compareAtPrice > selected.price && (
            <span className="product-price-compare">PKR {selected.compareAtPrice.toLocaleString("en-PK")}</span>
          )}{" "}
          PKR {selected.price.toLocaleString("en-PK")}
        </span>
      </button>
      <button className="buy-button" disabled={selected.available < 1} onClick={() => add(true)}>
        Buy now
      </button>
      {message && (
        <p className="purchase-message" aria-live="polite">
          {message}
        </p>
      )}
      <div className="purchase-benefits">
        <span>COD available</span>
        <span>Secure checkout</span>
        <span>Nationwide delivery</span>
        <Link href="/policies/returns">Easy returns</Link>
      </div>
      {toast && (
        <div className="cart-toast" role="status" aria-live="polite">
          <button type="button" className="cart-toast-close" onClick={() => setToast(null)} aria-label="Dismiss">
            ×
          </button>
          <div className="cart-toast-thumb">
            <Image src={product.imageUrl ?? "/category-still-life.webp"} alt="" fill sizes="56px" />
          </div>
          <div className="cart-toast-body">
            <strong>Added to your bag</strong>
            <p>
              {product.name} — {toast.variantName} · {money.format(toast.price)}
            </p>
          </div>
          <div className="cart-toast-actions">
            <Link href="/cart" className="cart-toast-primary">
              View bag
            </Link>
            <button type="button" onClick={() => setToast(null)}>
              Continue shopping
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
