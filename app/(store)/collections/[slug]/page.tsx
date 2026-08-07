import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { StoreHeader } from "../../_components/store-components";
import { StoreFooter } from "../../_components/store-footer";
import { ShopGrid } from "../../shop/shop-grid";
import { getActiveCategories, getCatalogProducts, getCollectionBySlug } from "@/lib/commerce";

const names: Record<string, string> = { scarves: "Scarves", bandanas: "Bandanas", glasses: "Eyewear", eyewear: "Eyewear" };

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://museandsilk.com";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const custom = names[slug] ? null : await getCollectionBySlug(slug);
  const title = custom?.name ?? names[slug] ?? "Collection";
  return {
    title,
    description: custom?.description || `Shop ${names[slug] ?? "the collection"} from Muse & Silk.`,
    alternates: { canonical: `/collections/${slug}` },
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const normalized = slug === "eyewear" ? "glasses" : slug;
  const [catalog, allCategories] = await Promise.all([getCatalogProducts(), getActiveCategories()]);
  const custom = names[slug] ? null : await getCollectionBySlug(slug);

  if (!names[slug] && !custom) notFound();

  const products = custom?.products ?? catalog.filter((product) => product.category === normalized);
  const title = custom?.name ?? names[slug] ?? "Collection";
  const heroCategory = names[slug] ? allCategories.find((entry) => entry.slug === normalized) : undefined;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
      { "@type": "ListItem", position: 2, name: title, item: `${SITE_ORIGIN}/collections/${slug}` },
    ],
  };

  return (
    <main className="page-fade-in">
      <StoreHeader theme="dark" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <section className={`collection-hero collection-${normalized}`}>
        <Image
          src={heroCategory?.imageUrl ?? "/category-still-life.webp"}
          alt=""
          fill
          priority
          sizes="100vw"
          {...(heroCategory?.blurDataUrl ? { placeholder: "blur" as const, blurDataURL: heroCategory.blurDataUrl } : {})}
        />
        <div />
        <p className="eyebrow">The signature edit</p>
        <h1>{title}</h1>
      </section>
      <ShopGrid products={products} showCategoryFilter={false} />

      <StoreFooter />
    </main>
  );
}
