"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import type { CatalogProduct } from "@/lib/commerce";
import { Price } from "./currency";

export function ProductCard({ product, priority = false, sizes }: { product: CatalogProduct; priority?: boolean; sizes?: string }) {
  const soldOut = product.stock < 1;
  const alt = product.altImageUrl;
  const cardSizes = sizes ?? "(max-width: 700px) 46vw, (max-width: 1100px) 25vw, 20vw";
  return (
    <article className="pcard">
      <Link href={`/products/${product.slug}`} className={`pcard-media${alt ? " has-alt" : ""}`} aria-label={product.name}>
        <Image
          src={product.imageUrl ?? "/placeholder.webp"}
          alt={product.name}
          fill
          sizes={cardSizes}
          priority={priority}
          {...(product.blurDataUrl ? { placeholder: "blur" as const, blurDataURL: product.blurDataUrl } : {})}
        />
        {alt && <Image className="pcard-alt" src={alt} alt="" fill sizes={cardSizes} loading="lazy" />}
        {soldOut ? <span className="pcard-badge soldout">Sold out</span> : product.badge ? <span className="pcard-badge">{product.badge}</span> : null}
      </Link>
      <div className="pcard-info">
        <Link href={`/products/${product.slug}`} className="pcard-title">
          {product.name}
        </Link>
        <p className="pcard-price">
          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <s>
              <Price amount={product.compareAtPrice} />
            </s>
          )}
          <Price amount={product.price} />
        </p>
      </div>
    </article>
  );
}

/** Horizontal, snap-scrolling product row (the "New arrivals" carousel). */
export function ProductRail({ products }: { products: CatalogProduct[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<"start" | "middle" | "end">("start");

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge(el.scrollLeft <= 4 ? "start" : el.scrollLeft >= max - 4 ? "end" : "middle");
  }
  function scrollBy(direction: 1 | -1) {
    const el = ref.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div className="rail-wrap">
      <button type="button" className="rail-arrow rail-prev" aria-label="Previous products" disabled={edge === "start"} onClick={() => scrollBy(-1)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <div className="rail" ref={ref} onScroll={onScroll}>
        {products.map((product, index) => (
          <ProductCard key={product.slug} product={product} priority={index < 3} />
        ))}
      </div>
      <button type="button" className="rail-arrow rail-next" aria-label="Next products" disabled={edge === "end"} onClick={() => scrollBy(1)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  );
}

export function NewsletterForm() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const result = await response.json();
    setMessage(response.ok ? "Thank you — you're on the list." : result.error ?? "Please try again.");
    if (response.ok) form.reset();
  }
  return (
    <>
      <form className="newsletter-form" onSubmit={submit}>
        <label>
          <span className="sr-only">Email address</span>
          <input name="email" type="email" required placeholder="Email address" autoComplete="email" />
        </label>
        <button type="submit">Subscribe</button>
      </form>
      <p className="form-message" aria-live="polite">
        {message}
      </p>
    </>
  );
}
