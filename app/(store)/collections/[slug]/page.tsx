import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StoreFooter } from "../../_components/store-footer";
import { ShopGrid } from "../../shop/shop-grid";
import { getActiveCategories, getCatalogProducts, getCollectionBySlug } from "@/lib/commerce";
import { BRAND, siteOrigin } from "@/lib/brand";
import { getNonce } from "@/lib/nonce";

export const revalidate = 300;

/** A slug resolves to a category first (the main storefront navigation) and otherwise to a custom,
 * admin-curated collection. */
async function resolve(slug: string) {
  const categories = await getActiveCategories();
  const category = categories.find((entry) => entry.slug === slug);
  if (category) return { kind: "category" as const, title: category.name, description: category.description ?? "", category };
  const collection = await getCollectionBySlug(slug);
  if (collection) return { kind: "collection" as const, title: collection.name, description: collection.description, collection };
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await resolve(slug);
  if (!found) return {};
  return {
    title: found.title,
    description: found.description || `Shop ${found.title} from ${BRAND.name}.`,
    alternates: { canonical: `/collections/${slug}` },
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await resolve(slug);
  if (!found) notFound();
  const nonce = getNonce();

  const products = found.kind === "collection" ? found.collection.products : (await getCatalogProducts()).filter((product) => product.category === slug);
  const origin = siteOrigin();
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: origin },
      { "@type": "ListItem", position: 2, name: found.title, item: `${origin}/collections/${slug}` },
    ],
  };

  return (
    <main className="page-fade-in">
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <header className="listing-head">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span>{found.title}</span>
        </nav>
        <h1 className="page-title">{found.title}</h1>
        {found.description && <p>{found.description}</p>}
      </header>
      <ShopGrid products={products} />
      <StoreFooter />
    </main>
  );
}
