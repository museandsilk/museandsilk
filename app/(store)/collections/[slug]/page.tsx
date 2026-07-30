import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StoreHeader } from "../../_components/store-components";
import { ShopGrid } from "../../shop/shop-grid";
import { getCatalogProducts, getCollectionBySlug } from "@/lib/commerce";

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
  const catalog = await getCatalogProducts();
  const custom = names[slug] ? null : await getCollectionBySlug(slug);

  if (!names[slug] && !custom) notFound();

  const products = custom?.products ?? catalog.filter((product) => product.category === normalized);
  const title = custom?.name ?? names[slug] ?? "Collection";

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
      { "@type": "ListItem", position: 2, name: title, item: `${SITE_ORIGIN}/collections/${slug}` },
    ],
  };

  return (
    <main>
      <StoreHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <section className={`collection-hero collection-${normalized}`}>
        <Image src="/category-still-life.webp" alt="" fill priority sizes="100vw" />
        <div />
        <p className="eyebrow">The signature edit</p>
        <h1>{title}</h1>
      </section>
      <ShopGrid products={products} />

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
