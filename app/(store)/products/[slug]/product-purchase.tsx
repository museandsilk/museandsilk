"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CatalogProduct, CatalogVariant } from "@/lib/commerce";
import { addCartItem, readCart } from "@/lib/cart";
import { Price } from "../../_components/currency";

export function ProductPurchase({
  product,
  colors,
  color,
  onColor,
  colorVariants,
  sized,
  selected,
  onSize,
}: {
  product: CatalogProduct;
  colors: string[];
  color: string;
  onColor: (color: string) => void;
  colorVariants: CatalogVariant[];
  sized: boolean;
  /** The chosen variant, or null while a size still has to be picked. */
  selected: CatalogVariant | null;
  onSize: (variantId: string) => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ variantName: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function add(buyNow = false) {
    if (!selected) {
      setMessage("Please select a size.");
      return;
    }
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
    setToast({ variantName: selected.name });
  }

  const allSoldOut = colorVariants.every((variant) => variant.available < 1);

  return (
    <div className="purchase-block">
      {colors.length > 1 && (
        <>
          <div className="choice-row">
            <span>Colour</span>
            <strong>{color}</strong>
          </div>
          <div className="color-options">
            {colors.map((item) => (
              <button key={item} type="button" className={item === color ? "active" : ""} onClick={() => onColor(item)}>
                {item}
              </button>
            ))}
          </div>
        </>
      )}

      {sized && (
        <>
          <div className="choice-row">
            <span>Size</span>
            <strong>{selected?.size ?? ""}</strong>
          </div>
          <div className="size-options" role="radiogroup" aria-label="Size">
            {colorVariants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                role="radio"
                aria-checked={selected?.id === variant.id}
                className={selected?.id === variant.id ? "active" : ""}
                disabled={variant.available < 1}
                onClick={() => {
                  onSize(variant.id);
                  setMessage("");
                }}
                title={variant.available < 1 ? "Sold out" : undefined}
              >
                {variant.size}
              </button>
            ))}
          </div>
        </>
      )}

      {selected && selected.available < 1 ? (
        <p className="stock-badge stock-badge-out">Sold out</p>
      ) : selected && selected.available < 5 ? (
        <p className="stock-badge stock-badge-low">Only {selected.available} left in stock</p>
      ) : allSoldOut ? (
        <p className="stock-badge stock-badge-out">Sold out</p>
      ) : null}

      <button className="add-button" type="button" disabled={allSoldOut || (selected !== null && selected.available < 1)} onClick={() => add()}>
        {allSoldOut ? "Sold out" : "Add to bag"}
      </button>
      <button className="buy-button" type="button" disabled={allSoldOut || (selected !== null && selected.available < 1)} onClick={() => add(true)}>
        Buy it now
      </button>
      {message && (
        <p className="purchase-message" role="alert">
          {message}
        </p>
      )}
      <div className="purchase-benefits">
        <span>Cash on delivery</span>
        <span>Nationwide delivery</span>
        <Link href="/policies/returns">Easy exchanges</Link>
      </div>
      {toast && (
        <div className="cart-toast" role="status" aria-live="polite">
          <button type="button" className="cart-toast-close" onClick={() => setToast(null)} aria-label="Dismiss">
            ×
          </button>
          <div className="cart-toast-thumb">
            <Image src={product.imageUrl ?? "/placeholder.webp"} alt="" fill sizes="56px" />
          </div>
          <div className="cart-toast-body">
            <strong>Added to your bag</strong>
            <p>
              {product.name} — {toast.variantName}
              {selected && (
                <>
                  {" · "}
                  <Price amount={selected.price} />
                </>
              )}
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
