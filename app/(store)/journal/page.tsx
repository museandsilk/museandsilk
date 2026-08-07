import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { StoreHeader } from "../_components/store-components";
import { StoreFooter } from "../_components/store-footer";
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

      <StoreFooter />
    </main>
  );
}
