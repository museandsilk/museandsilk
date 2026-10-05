"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { liteClient } from "algoliasearch/lite";
import { cartCount, readCart } from "@/lib/cart";
import { Price } from "./currency";

type NavCategory = { name: string; slug: string };

type Hit = {
  objectID: string;
  name: string;
  slug: string;
  price: number;
  imageUrl: string | null;
  category: string;
  _highlightResult?: { name?: { value: string } };
};

const APP_ID = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
const SEARCH_KEY = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
const INDEX = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME || "nure_asmir_products";

const searchClient = APP_ID && SEARCH_KEY ? liteClient(APP_ID, SEARCH_KEY) : null;

const Icon = {
  menu: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18" /></svg>,
  search: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  bag: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></svg>,
  close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg>,
};

export function HeaderClient({
  categories,
  freeDeliveryThreshold,
  whatsappNumber,
}: {
  categories: NavCategory[];
  freeDeliveryThreshold: number | null;
  whatsappNumber: string;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bagCount, setBagCount] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const update = () => setBagCount(cartCount(readCart()));
    update();
    window.addEventListener("na-cart-change", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("na-cart-change", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen || searchOpen ? "hidden" : "";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, searchOpen]);

  const messages = useMemo(
    () => [
      freeDeliveryThreshold
        ? `Free shipping across Pakistan on orders above Rs. ${freeDeliveryThreshold.toLocaleString("en-PK")}`
        : "Free shipping across Pakistan on qualifying orders",
      "Cash on delivery available",
      "New arrivals every week",
    ],
    [freeDeliveryThreshold],
  );
  useEffect(() => {
    const timer = window.setInterval(() => setMessageIndex((index) => (index + 1) % messages.length), 4500);
    return () => window.clearInterval(timer);
  }, [messages.length]);

  const waLink = whatsappNumber ? `https://wa.me/${whatsappNumber.replace(/[^\d]/g, "")}` : "/contact";
  const closeAll = () => {
    setMenuOpen(false);
    setSearchOpen(false);
  };

  return (
    <>
      <div className="announcement" role="status">
        <div className="announcement-ticker">
          {messages.map((message, index) => {
            const previous = (messageIndex - 1 + messages.length) % messages.length;
            const state = index === messageIndex ? "ticker-current" : index === previous ? "ticker-prev" : "ticker-hidden";
            return (
              <span key={message} className={state}>
                {message}
              </span>
            );
          })}
        </div>
      </div>

      <header className="site-header">
        <div className="hdr-side">
          <button type="button" className="icon-btn" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            {Icon.menu}
          </button>
          <button type="button" className="icon-btn" aria-label="Search" onClick={() => setSearchOpen(true)}>
            {Icon.search}
          </button>
          <button type="button" className="hdr-search-hint" onClick={() => setSearchOpen(true)}>
            Search
          </button>
        </div>
        <Link href="/" className="logo" aria-label="Nure Asmir — home">
          <Image src="/brand/wordmark.png" alt="Nure Asmir" width={395} height={100} priority unoptimized />
        </Link>
        <div className="hdr-side hdr-right">
          <Link href="/cart" className="icon-btn" aria-label={`Bag, ${bagCount} items`}>
            {Icon.bag}
            <span className="cart-count" data-empty={bagCount === 0}>
              {bagCount}
            </span>
          </Link>
        </div>
      </header>

      {(menuOpen || searchOpen) && <button type="button" className="scrim" aria-label="Close panel" onClick={closeAll} />}

      <aside className={`drawer ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen} aria-label="Menu">
        <div className="drawer-top">
          <Link href="/" className="logo" onClick={closeAll} aria-label="Nure Asmir — home">
            <Image src="/brand/wordmark.png" alt="Nure Asmir" width={395} height={100} unoptimized />
          </Link>
          <button type="button" className="icon-btn" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            {Icon.close}
          </button>
        </div>
        <nav>
          <Link href="/shop" onClick={closeAll}>New arrivals</Link>
          {categories.map((category) => (
            <Link key={category.slug} href={`/collections/${category.slug}`} onClick={closeAll}>
              {category.name}
            </Link>
          ))}
          <Link href="/about" onClick={closeAll}>Our story</Link>
          <Link href="/track-order" onClick={closeAll}>Track order</Link>
          <Link href="/contact" onClick={closeAll}>Contact</Link>
        </nav>
        <div className="drawer-foot">
          <a href={waLink} target="_blank" rel="noreferrer">WhatsApp us</a>
          <Link href="/faq" onClick={closeAll}>FAQ</Link>
          <Link href="/policies/shipping" onClick={closeAll}>Shipping &amp; returns</Link>
        </div>
      </aside>

      <SearchOverlay
        open={searchOpen}
        categories={categories}
        onClose={() => setSearchOpen(false)}
        onSubmit={(query) => {
          setSearchOpen(false);
          router.push(`/search?q=${encodeURIComponent(query)}`);
        }}
      />
    </>
  );
}

function SearchOverlay({
  open,
  categories,
  onClose,
  onSubmit,
}: {
  open: boolean;
  categories: NavCategory[];
  onClose: () => void;
  onSubmit: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (!term || !searchClient) {
      // Clearing results when the query is emptied is derived state that must follow the input.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHits([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchClient
        .search<Hit>({
          requests: [
            {
              indexName: INDEX,
              query: term,
              hitsPerPage: 8,
              attributesToRetrieve: ["name", "slug", "price", "imageUrl", "category"],
              attributesToHighlight: ["name"],
              highlightPreTag: "<mark>",
              highlightPostTag: "</mark>",
            },
          ],
        })
        .then((response) => {
          if (cancelled) return;
          const result = response.results[0] as { hits: Hit[]; nbHits?: number };
          setHits(result.hits);
          setTotal(result.nbHits ?? result.hits.length);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const term = query.trim();
  return (
    <div className={`search-overlay ${open ? "is-open" : ""}`} aria-hidden={!open} role="dialog" aria-label="Search">
      <form
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          if (term) onSubmit(term);
        }}
      >
        {Icon.search}
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search kameez shalwar, shirts, pants…"
          aria-label="Search products"
          autoComplete="off"
        />
        <button type="button" className="icon-btn" aria-label="Close search" onClick={onClose}>
          {Icon.close}
        </button>
      </form>

      {!term && (
        <div className="search-suggest">
          {categories.map((category) => (
            <button key={category.slug} type="button" onClick={() => setQuery(category.name)}>
              {category.name}
            </button>
          ))}
        </div>
      )}

      {term && (
        <div className="search-results">
          <p className="search-meta" aria-live="polite">
            {loading ? "Searching…" : total ? `${total} result${total === 1 ? "" : "s"}` : "No matches — try another word"}
          </p>
          <div className="search-hits">
            {hits.map((hit) => (
              <Link key={hit.objectID} href={`/products/${hit.slug}`} className="search-hit" onClick={onClose}>
                <div className="search-hit-media">
                  <Image src={hit.imageUrl ?? "/placeholder.webp"} alt="" fill sizes="(max-width: 900px) 46vw, 240px" />
                </div>
                <p
                  className="search-hit-title"
                  dangerouslySetInnerHTML={{ __html: sanitizeHighlight(hit._highlightResult?.name?.value ?? hit.name) }}
                />
                <p className="search-hit-price">
                  <Price amount={hit.price} />
                </p>
              </Link>
            ))}
          </div>
          {total > hits.length && (
            <div className="search-all">
              <button type="button" className="button button-dark" onClick={() => onSubmit(term)}>
                View all {total} results
              </button>
            </div>
          )}
          <p className="search-powered">Search by Algolia</p>
        </div>
      )}
    </div>
  );
}

/** Algolia returns the product name with <mark> tags around matches — escape everything else so
 * a product name can never inject markup. */
function sanitizeHighlight(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}
