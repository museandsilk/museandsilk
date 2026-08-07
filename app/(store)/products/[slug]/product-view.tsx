"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CatalogProduct } from "@/lib/commerce";
import { ProductGallery } from "./product-gallery";
import { ProductPurchase } from "./product-purchase";
import { BackButton } from "./back-button";

/** Renders the gallery and the buy column together so picking a color/variant swaps the gallery
 * to that variant's own photos — the two used to be unconnected siblings, each managing its own
 * state, so switching color never touched what images were shown. A shopper choosing "Crimson
 * Red" saw the "Emerald Green" photos the whole time. Falls back to the product's shared photos
 * (never tied to a specific variant) for any variant that has none of its own, and falls back
 * further to every photo the product has if even that comes up empty, so the gallery is never
 * blank. Returns a Fragment (no wrapping element) so the two-column `.product-page` grid layout
 * in globals.css still applies directly to its children. */
export function ProductView({
  product,
  crop,
  fallback,
  codReservationHours,
  bankReservationHours,
}: {
  product: CatalogProduct;
  crop: string;
  fallback: string;
  codReservationHours: number;
  bankReservationHours: number;
}) {
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
  const [selectedId, setSelectedId] = useState(variants.find((v) => v.isDefault)?.id ?? variants[0].id);

  const gallery = useMemo(() => {
    const ownPhotos = product.images.filter((image) => image.variantId === selectedId);
    if (ownPhotos.length) return ownPhotos;
    const sharedPhotos = product.images.filter((image) => !image.variantId);
    return sharedPhotos.length ? sharedPhotos : product.images;
  }, [product.images, selectedId]);

  return (
    <>
      <ProductGallery name={product.name} crop={crop} images={gallery} fallback={fallback} />
      <div className="product-buy">
        <nav aria-label="Breadcrumb">
          <BackButton />
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href={`/collections/${product.category}`}>{product.type}</Link>
        </nav>
        <p className="eyebrow">{product.type}</p>
        <h1>{product.name}</h1>
        <p className="product-price">
          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <span className="product-price-compare">PKR {product.compareAtPrice.toLocaleString("en-PK")}</span>
          )}
          PKR {product.price.toLocaleString("en-PK")}
        </p>
        <p className="product-intro">
          {product.shortDescription || "A composed study in line, texture and warm neutral color—designed to make even the simplest look feel intentional."}
        </p>
        <ProductPurchase product={product} variants={variants} selectedId={selectedId} onSelectVariant={setSelectedId} />
        <div className="product-accordions">
          <details open>
            <summary>
              Details &amp; material <span>+</span>
            </summary>
            <p>{product.description || "Fine silk-touch construction with a softly luminous finish."}</p>
          </details>
          <details>
            <summary>
              Dimensions &amp; care <span>+</span>
            </summary>
            <p>
              {product.dimensions ? `${product.dimensions}. ` : ""}
              {product.careInstructions || "Store folded in the included pouch. Gentle specialist cleaning recommended."}
            </p>
          </details>
          <details>
            <summary>
              Delivery &amp; returns <span>+</span>
            </summary>
            <p>
              Nationwide delivery. Cash-on-delivery orders are reserved for {codReservationHours} hours; bank-deposit orders for{" "}
              {bankReservationHours} hours. Final return eligibility appears before checkout.
            </p>
          </details>
        </div>
        <Link className="whatsapp-help" href="/contact">
          Need help? Talk to us on WhatsApp <span>↗︎</span>
        </Link>
      </div>
    </>
  );
}
