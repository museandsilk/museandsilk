"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CatalogProduct } from "@/lib/commerce";
import { addCartItem } from "@/lib/cart";

export function ProductPurchase({ product }: { product: CatalogProduct }) {
  const router = useRouter();
  const variants = product.variants.length
    ? product.variants
    : [
        {
          id: product.sku,
          name: product.color,
          sku: product.sku,
          color: product.color,
          price: product.price,
          compareAtPrice: product.compareAtPrice,
          stock: product.stock,
          reserved: 0,
          available: product.stock,
          isDefault: true,
        },
      ];
  const [selectedId, setSelectedId] = useState(variants[0].id);
  const [message, setMessage] = useState("");
  const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0];

  function add(buyNow = false) {
    if (selected.available < 1) {
      setMessage("This option is currently sold out.");
      return;
    }
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
    });
    setMessage(`${product.name} in ${selected.color} was added to your bag.`);
    if (buyNow) router.push("/cart");
  }

  return (
    <div className="purchase-block">
      <div className="choice-row">
        <span>Color</span>
        <strong>{selected.color}</strong>
      </div>
      <div className="color-options">
        {variants.map((variant, index) => (
          <button
            key={variant.id}
            aria-label={`Choose ${variant.color}`}
            className={selected.id === variant.id ? "active" : ""}
            onClick={() => setSelectedId(variant.id)}
            disabled={variant.available < 1}
          >
            <i className={`option-${index % 3}`} />
          </button>
        ))}
      </div>
      <button className="add-button" disabled={selected.available < 1} onClick={() => add()}>
        Add to bag <span>PKR {selected.price.toLocaleString("en-PK")}</span>
      </button>
      <button className="buy-button" disabled={selected.available < 1} onClick={() => add(true)}>
        Buy now
      </button>
      <p className="purchase-message" aria-live="polite">
        {message}
      </p>
      <div className="purchase-benefits">
        <span>COD available</span>
        <span>Secure checkout</span>
        <span>Nationwide delivery</span>
      </div>
    </div>
  );
}
