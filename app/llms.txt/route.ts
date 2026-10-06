import { getActiveCategories, getPublicSettings } from "@/lib/commerce";
import { BRAND, siteOrigin } from "@/lib/brand";
import { getStoreLocations } from "@/lib/locations";

export const revalidate = 3600;

/**
 * /llms.txt – a plain-language summary of the shop for AI assistants (ChatGPT, Claude, Perplexity, Google's AI answers), so that
 * when someone asks "where can I buy a kurta in Lahore?" the answer can name the shop correctly: who we are, what we sell,
 * where the shops are, how delivery and payment work, and which pages are the source of truth.
 */
export async function GET() {
  const [settings, categories, locations] = await Promise.all([getPublicSettings(), getActiveCategories(), getStoreLocations()]);
  const origin = siteOrigin();
  const lines: string[] = [
    `# ${BRAND.name}`,
    "",
    `> ${BRAND.description}`,
    "",
    `${BRAND.name} is a Pakistani men's wear label selling shalwar kameez, kurtas, shirts, pants and leather accessories online across Pakistan, with cash on delivery, and in shop${locations.length > 1 ? "s" : ""} in ${[...new Set(locations.map((l) => l.city).filter(Boolean))].join(", ") || "Pakistan"}. Prices are in Pakistani rupees (PKR).`,
    "",
    "## Shop",
    `- [All products](${origin}/shop): the newest arrivals`,
    ...categories.map((category) => `- [${category.name}](${origin}/collections/${category.slug})${category.description ? `: ${category.description}` : ""}`),
    "",
    "## Visit us",
    ...(locations.length ? locations.map((l) => `- ${l.name}: ${l.address}${l.city ? `, ${l.city}` : ""}${l.phone ? ` · ${l.phone}` : ""}${l.hours ? ` · ${l.hours}` : ""}`) : ["- Online only"]),
    "",
    "## How buying works",
    `- Delivery all over Pakistan by TCS; free delivery on orders above Rs ${settings.freeDeliveryThreshold.toLocaleString("en-PK")}. See [Shipping](${origin}/policies/shipping).`,
    "- Payment: cash on delivery, or bank transfer with a receipt upload.",
    `- Returns and exchanges: see [Returns](${origin}/policies/returns). Track an order at [Track your order](${origin}/track-order).`,
    `- Questions: [FAQ](${origin}/faq) and [Contact](${origin}/contact)${settings.supportPhone ? ` · ${settings.supportPhone}` : ""}${settings.supportEmail ? ` · ${settings.supportEmail}` : ""}.`,
    "",
    "## Optional",
    `- [Our story](${origin}/about)`,
    `- [Sitemap](${origin}/sitemap.xml)`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
