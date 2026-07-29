import type { FeedProduct } from "@/lib/commerce";

const FALLBACK_IMAGE = "/category-still-life.webp";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatPrice(price: number): string {
  return `${price.toFixed(2)} PKR`;
}

/** Builds a Google Shopping / Meta Catalog compatible RSS 2.0 feed (with the `g:` namespace) from
 * published products + their active variants. One `<item>` is emitted per variant, grouped under
 * the parent product via g:item_group_id so multi-variant products render as a single listing. */
export function buildProductFeedXml(feedProducts: FeedProduct[], origin: string, title: string, description: string): string {
  const items = feedProducts.flatMap((product) => {
    const link = `${origin}/products/${product.slug}`;
    const imageLink = product.imageId ? `${origin}/api/media/${product.imageId}` : `${origin}${FALLBACK_IMAGE}`;
    const rawDescription = product.description ? stripHtml(product.description) : `${product.name} from Muse & Silk. Nationwide delivery across Pakistan.`;

    return product.variants.map((variant) => {
      const itemTitle = `${product.name} - ${variant.color}`;
      const availability = variant.available > 0 ? "in_stock" : "out_of_stock";
      const mpnOrGtin = variant.gtin ? `<g:gtin>${escapeXml(variant.gtin)}</g:gtin>` : `<g:mpn>${escapeXml(variant.sku)}</g:mpn>`;
      const categoryTag = product.googleProductCategory
        ? `<g:google_product_category>${escapeXml(product.googleProductCategory)}</g:google_product_category>`
        : "";

      return `
    <item>
      <g:id>${escapeXml(variant.sku)}</g:id>
      <title>${escapeXml(itemTitle)}</title>
      <description>${escapeXml(rawDescription)}</description>
      <link>${escapeXml(link)}</link>
      <g:image_link>${escapeXml(imageLink)}</g:image_link>
      <g:condition>new</g:condition>
      <g:availability>${availability}</g:availability>
      <g:price>${formatPrice(variant.price)}</g:price>
      <g:brand>Muse &amp; Silk</g:brand>
      <g:item_group_id>${escapeXml(product.id)}</g:item_group_id>
      ${categoryTag}
      ${mpnOrGtin}
    </item>`;
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(origin)}</link>
    <description>${escapeXml(description)}</description>
    ${items.join("")}
  </channel>
</rss>`;
}
