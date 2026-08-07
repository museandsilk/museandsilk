import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoreHeader } from "../../_components/store-components";
import { getProductBySlug, getPublicSettings } from "@/lib/commerce";
import { cropForCategory } from "@/lib/slug";
import { ProductView } from "./product-view";

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
  const [product, settings] = await Promise.all([getProductBySlug(slug), getPublicSettings()]);
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
        <ProductView
          product={product}
          crop={crop}
          fallback={fallbackImage}
          codReservationHours={settings.codReservationHours}
          bankReservationHours={settings.bankReservationHours}
        />
      </section>
    </main>
  );
}
