"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { CatalogProduct } from "@/lib/commerce";
import { cartCount, readCart } from "@/lib/cart";
import { cropForCategory } from "@/lib/slug";

const money = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });

export function StoreHeader({ theme = "light" }: { theme?: "dark" | "light" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [bagCount, setBagCount] = useState(0);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState<number | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  useEffect(() => {
    const update = () => setBagCount(cartCount(readCart()));
    update();
    window.addEventListener("muse-cart-change", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("muse-cart-change", update); window.removeEventListener("storage", update); };
  }, []);
  useEffect(() => {
    fetch("/api/checkout/options", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.settings?.freeDeliveryThreshold) setFreeDeliveryThreshold(data.settings.freeDeliveryThreshold);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.body.style.overflow = menuOpen || searchOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen, searchOpen]);

  const announcementMessages = [
    freeDeliveryThreshold
      ? `Nationwide free shipping on orders above PKR ${freeDeliveryThreshold.toLocaleString("en-PK")}`
      : "Nationwide free shipping on qualifying orders",
    "New collection live!",
    "Delivery can take up to 2–5 working days",
    "Wrapped in elegance.",
  ];
  useEffect(() => {
    const timer = window.setInterval(() => setMessageIndex((index) => (index + 1) % announcementMessages.length), 4000);
    return () => window.clearInterval(timer);
  }, [announcementMessages.length]);

  return (
    <>
      <div className="announcement">
        <div className="announcement-ticker">
          {announcementMessages.map((message, index) => {
            const previousIndex = (messageIndex - 1 + announcementMessages.length) % announcementMessages.length;
            const state = index === messageIndex ? "ticker-current" : index === previousIndex ? "ticker-prev" : "ticker-hidden";
            return (
              <span key={message} className={state}>
                {message}
              </span>
            );
          })}
        </div>
      </div>
      <header className={`header ${theme === "light" ? "header-light" : ""}`}>
        <button className="mobile-menu-button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><i /><i /></button>
        <nav className="main-nav" aria-label="Primary navigation"><Link href="/shop">New</Link><Link href="/collections/scarves">Scarves</Link><Link href="/collections/bandanas">Bandanas</Link><Link href="/collections/glasses">Eyewear</Link><Link href="/journal">The edit</Link></nav>
        <Link href="/" className="wordmark" aria-label="Muse and Silk, home">MUSE <i>&amp;</i> SILK</Link>
        <nav className="utility-nav" aria-label="Store tools"><button onClick={() => setSearchOpen(true)}>Search</button><Link href="/track-order">Track</Link><Link href="/cart" className="bag-link">Bag <span>{bagCount}</span></Link></nav>
      </header>
      <div className={`menu-panel ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen}>
        <div className="panel-top"><span className="wordmark">MUSE <i>&amp;</i> SILK</span><button onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button></div>
        <nav>{[["New arrivals","/shop"],["Scarves","/collections/scarves"],["Bandanas","/collections/bandanas"],["Eyewear","/collections/glasses"],["The edit","/journal"],["Our story","/about"]].map(([label, href], index) => <Link href={href} key={href} onClick={() => setMenuOpen(false)}><span>0{index+1}</span>{label}<b aria-hidden="true">↗︎</b></Link>)}</nav>
        <div className="menu-panel-footer"><Link href="/track-order">Track an order</Link><Link href="/contact">WhatsApp</Link><span>PKR · Pakistan</span></div>
      </div>
      <div className={`search-panel ${searchOpen ? "is-open" : ""}`} aria-hidden={!searchOpen}>
        <div className="panel-top"><span className="eyebrow">Search the collection</span><button onClick={() => setSearchOpen(false)} aria-label="Close search">×</button></div>
        <label><span className="sr-only">Search products</span><input autoFocus={searchOpen} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Scarf, oxblood, sunglasses…" /><span aria-hidden="true">⌕</span></label>
        <div className="search-suggestions"><p>{query ? "Search now" : "Popular now"}</p>{query ? <Link href={`/search?q=${encodeURIComponent(query)}`} onClick={() => setSearchOpen(false)}>View results for &ldquo;{query}&rdquo; <span>→︎</span></Link> : ["Silk scarves","Oxblood","Tortoiseshell frames"].map(item => <button key={item} onClick={() => setQuery(item)}>{item}</button>)}</div>
      </div>
      {(menuOpen || searchOpen) && <button className="page-scrim" aria-label="Close panel" onClick={() => { setMenuOpen(false); setSearchOpen(false); }} />}
    </>
  );
}

export function ProductCard({ product }: { product: CatalogProduct }) {
  const [saved, setSaved] = useState(false);
  const crop = cropForCategory(product.category);

  // Products with more than one variant image cycle through each color/style automatically —
  // one shared interval per card, crossfading via opacity so nothing ever pops.
  const gallery = product.variantImages.length > 1 ? product.variantImages : null;
  const [activeImage, setActiveImage] = useState(0);
  useEffect(() => {
    if (!gallery) return;
    const timer = window.setInterval(() => setActiveImage((index) => (index + 1) % gallery.length), 4000);
    return () => window.clearInterval(timer);
  }, [gallery]);

  return (
    <article className="product-card">
      <Link href={`/products/${product.slug}`} className={`product-image crop-${crop}`}>
        {gallery ? (
          gallery.map((image, index) => (
            <Image
              key={image.id}
              src={image.url}
              alt={product.name}
              fill
              sizes="(max-width: 760px) 50vw, 25vw"
              className={`product-image-slide ${index === activeImage ? "is-active" : ""}`}
              {...(image.blurDataUrl ? { placeholder: "blur" as const, blurDataURL: image.blurDataUrl } : {})}
            />
          ))
        ) : (
          <Image src={product.imageUrl ?? "/category-still-life.webp"} alt={product.name} fill sizes="(max-width: 760px) 50vw, 25vw" {...(product.blurDataUrl ? { placeholder: "blur" as const, blurDataURL: product.blurDataUrl } : {})} />
        )}
        {product.stock < 1 ? <span className="product-badge product-badge-soldout">Sold out</span> : product.badge && <span className="product-badge">{product.badge}</span>}<span className="quick-view">View piece</span></Link>
      <button className={`save-button ${saved ? "saved" : ""}`} onClick={() => setSaved(!saved)} aria-label={saved ? `Remove ${product.name} from saved pieces` : `Save ${product.name}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} aria-hidden="true">
          <path d="M12 21s-7.5-4.6-10.2-9.1C.2 8.9 1.4 5 5 4c2.4-.7 4.6.4 7 3 2.4-2.6 4.6-3.7 7-3 3.6 1 4.8 4.9 3.2 7.9C19.5 16.4 12 21 12 21z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="product-info"><div><p>{product.type}</p><Link href={`/products/${product.slug}`}>{product.name}</Link></div><strong>{product.compareAtPrice && product.compareAtPrice > product.price && <span className="product-price-compare">{money.format(product.compareAtPrice)}</span>}{money.format(product.price)}</strong></div>
      <div className="product-color"><i className={`swatch swatch-${crop}`} />{product.color}</div>
    </article>
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
    setMessage(response.ok ? "You're on the private list." : result.error ?? "Please try again.");
    if (response.ok) form.reset();
  }
  return <><form className="newsletter-form" onSubmit={submit}><label><span className="sr-only">Email address</span><input name="email" type="email" required placeholder="Your email address" /></label><button type="submit">Join the list <span aria-hidden="true">→︎</span></button></form><p className="form-message" aria-live="polite">{message}</p></>;
}
