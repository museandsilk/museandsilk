import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StoreHeader } from "../../_components/store-components";
import { ProductPurchase } from "./product-purchase";
import { getProductBySlug } from "@/lib/commerce";
import { cropForCategory } from "@/lib/slug";
import { ProductGallery } from "./product-gallery";
import { BackButton } from "./back-button";

export const revalidate = 300;

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://museandsilk.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  const title = product.seoTitle || product.name;
  const description = product.seoDescription || product.shortDescription || `${product.name} in ${product.color}. Nationwide delivery across Pakistan with cash on delivery available.`;
  return {
    title,
    description,
    alternates: { canonical: `/products/${product.slug}` },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const crop = cropForCategory(product.category);
  const fallbackImage = "/category-still-life.webp";
  const primaryImage = product.imageUrl ? `${SITE_ORIGIN}${product.imageUrl}` : `${SITE_ORIGIN}${fallbackImage}`;
  const canonicalUrl = `${SITE_ORIGIN}/products/${product.slug}`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_ORIGIN },
      { "@type": "ListItem", position: 2, name: product.type, item: `${SITE_ORIGIN}/collections/${product.category}` },
      { "@type": "ListItem", position: 3, name: product.name, item: canonicalUrl },
    ],
  };

  const jsonLd =
    product.variants.length >= 2
      ? {
          "@context": "https://schema.org",
          "@type": "ProductGroup",
          name: product.name,
          description: product.seoDescription || product.shortDescription || product.description,
          brand: { "@type": "Brand", name: "Muse & Silk" },
          productGroupID: product.id,
          variesBy: ["https://schema.org/color"],
          hasVariant: product.variants.map((variant) => ({
            "@type": "Product",
            name: `${product.name} — ${variant.color}`,
            sku: variant.sku,
            color: variant.color,
            image: [primaryImage],
            offers: {
              "@type": "Offer",
              priceCurrency: "PKR",
              price: variant.price,
              availability: variant.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              url: canonicalUrl,
            },
          })),
        }
      : {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          image: [primaryImage],
          description: product.seoDescription || product.shortDescription || product.description,
          sku: product.sku,
          brand: { "@type": "Brand", name: "Muse & Silk" },
          offers: {
            "@type": "Offer",
            priceCurrency: "PKR",
            price: product.price,
            availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url: canonicalUrl,
          },
        };

  return (
    <main className="page-fade-in">
      <StoreHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <section className="product-page">
        <ProductGallery name={product.name} crop={crop} images={product.images} fallback={fallbackImage} />
        <div className="product-buy">
          <nav aria-label="Breadcrumb">
            <BackButton />
            <Link href="/">Home</Link>
            <span>/</span>
            <Link href={`/collections/${product.category}`}>{product.type}</Link>
          </nav>
          <p className="eyebrow">{product.type}</p>
          <h1>{product.name}</h1>
          <p className="product-price">PKR {product.price.toLocaleString("en-PK")}</p>
          <p className="product-intro">
            {product.shortDescription || "A composed study in line, texture and warm neutral color—designed to make even the simplest look feel intentional."}
          </p>
          <ProductPurchase product={product} />
          <div className="product-accordions">
            <details open>
              <summary>
                Details &amp; material <span>+</span>
              </summary>
              <p>{product.description || "Fine silk-touch construction with a softly luminous finish."}</p>
            </details>
            <details>
              <summary>
                Dimensions &amp; care <span>+</span>
              </summary>
              <p>
                {product.dimensions ? `${product.dimensions}. ` : ""}
                {product.careInstructions || "Store folded in the included pouch. Gentle specialist cleaning recommended."}
              </p>
            </details>
            <details>
              <summary>
                Delivery &amp; returns <span>+</span>
              </summary>
              <p>Nationwide delivery. Cash-on-delivery orders are reserved for 12 hours; bank-deposit orders for 24 hours. Final return eligibility appears before checkout.</p>
            </details>
          </div>
          <Link className="whatsapp-help" href="/contact">
            Need help? Talk to us on WhatsApp <span>↗︎</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
