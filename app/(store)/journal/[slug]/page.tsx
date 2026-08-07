import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StoreHeader } from "../../_components/store-components";
import { StoreFooter } from "../../_components/store-footer";
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

      <StoreFooter />
    </main>
  );
}
