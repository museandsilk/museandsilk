import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { StoreHeader } from "../_components/store-components";
import { journalArticles } from "./journal-data";

export const metadata: Metadata = {
  title: "The journal",
  description: "Practical styling, material care and quiet inspiration from Muse & Silk, for pieces meant to live beyond a season.",
  alternates: { canonical: "/journal" },
};

const images = ["/category-still-life.webp", "/campaign-hero.webp", "/category-still-life.webp"];

export default function JournalPage() {
  return (
    <main>
      <StoreHeader />
      <section className="journal-page">
        <header>
          <p className="eyebrow">Notes from the studio</p>
          <h1>The edit</h1>
          <p>Practical styling, material care and quiet inspiration.</p>
        </header>
        <div>
          {journalArticles.map((article, index) => (
            <Link href={`/journal/${article.slug}`} key={article.slug}>
              <div>
                <Image src={images[index % images.length]} alt="" fill sizes="50vw" />
              </div>
              <p className="eyebrow">
                {article.category} · {article.readTime}
              </p>
              <h2>{article.title}</h2>
              <span>Read the story →︎</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div className="footer-brand">
          <Link href="/" className="wordmark">
            MUSE <i>&amp;</i> SILK
          </Link>
          <p>Modern accessories, composed with intention.</p>
        </div>
        <div className="footer-links">
          <div>
            <h3>Shop</h3>
            <Link href="/collections/scarves">Scarves</Link>
            <Link href="/collections/bandanas">Bandanas</Link>
            <Link href="/collections/glasses">Eyewear</Link>
            <Link href="/shop">New arrivals</Link>
          </div>
          <div>
            <h3>Service</h3>
            <Link href="/track-order">Track your order</Link>
            <Link href="/policies/shipping">Shipping</Link>
            <Link href="/policies/returns">Returns</Link>
            <Link href="/contact">WhatsApp assistance</Link>
          </div>
          <div>
            <h3>About</h3>
            <Link href="/about">Our story</Link>
            <Link href="/journal">Journal</Link>
            <Link href="/contact">Contact</Link>
            <a href="https://instagram.com" rel="noreferrer">
              Instagram
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Muse &amp; Silk</span>
          <span>Prices in PKR</span>
          <div>
            <Link href="/policies/privacy">Privacy</Link>
            <Link href="/policies/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
