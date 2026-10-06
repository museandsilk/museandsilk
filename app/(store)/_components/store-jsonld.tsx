import { siteOrigin } from "@/lib/brand";
import { BRAND } from "@/lib/brand";
import { getPublicSettings } from "@/lib/commerce";
import { getStoreLocations } from "@/lib/locations";
import { getNonce } from "@/lib/nonce";

/**
 * Each physical shop as a schema.org ClothingStore (address, phone, map pin, opening hours text). This is what lets Google show the
 * shop in local results and on maps, and lets AI assistants answer "where is Nure Asmir in Lahore?" with the real address.
 */
export async function StoreJsonLd() {
  const [locations, settings] = await Promise.all([getStoreLocations(), getPublicSettings()]);
  if (!locations.length) return null;
  const origin = siteOrigin();
  const data = locations.map((shop) => ({
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    "@id": `${origin}/contact#${shop.id}`,
    name: locations.length > 1 ? shop.name : BRAND.name,
    url: origin,
    image: `${origin}/og.jpg`,
    logo: `${origin}/logo.png`,
    priceRange: "₨₨",
    ...(shop.phone || settings.supportPhone ? { telephone: shop.phone || settings.supportPhone } : {}),
    address: { "@type": "PostalAddress", streetAddress: shop.address, addressLocality: shop.city || undefined, addressCountry: "PK" },
    ...(shop.latitude != null && shop.longitude != null ? { geo: { "@type": "GeoCoordinates", latitude: shop.latitude, longitude: shop.longitude } } : {}),
    ...(shop.hours ? { openingHours: shop.hours } : {}),
    sameAs: [settings.instagramUrl, settings.facebookUrl, settings.tiktokUrl].filter(Boolean),
    parentOrganization: { "@type": "Organization", name: BRAND.name, url: origin },
  }));
  return <script type="application/ld+json" nonce={getNonce()} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
