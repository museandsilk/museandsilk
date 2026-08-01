import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StoreHeader } from "../../_components/store-components";
import { Reveal } from "../../_components/reveal";
import { getJournalArticle, journalArticles } from "../journal-data";

export function generateStaticParams() {
  return journalArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const article = getJournalArticle((await params).slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: `/journal/${article.slug}` },
  };
}

export default async function JournalArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = getJournalArticle((await params).slug);
  if (!article) notFound();

  return (
    <main>
      <StoreHeader />
      <article className="journal-article">
        <p className="eyebrow">The Muse &amp; Silk journal</p>
        <h1>{article.title}</h1>
        <p className="article-intro">{article.intro}</p>
        {article.sections.map((section, index) => (
          <section key={section.heading}>
            <span>0{index + 1}</span>
            <div>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </div>
          </section>
        ))}
        <Link href="/journal" className="text-link">
          ← Return to the edit
        </Link>
      </article>

      <Reveal>
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
      </Reveal>
    </main>
  );
}
