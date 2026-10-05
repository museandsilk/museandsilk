/** Single source of truth for brand copy used outside the DB-backed site settings. */
export const BRAND = {
  name: "Nure Asmir",
  descriptor: "Men's Wear",
  tagline: "Tradition in a modern form",
  description:
    "Nure Asmir is a Pakistani men's wear label — shalwar kameez, shirts, pants and leather accessories, delivered nationwide with cash on delivery.",
  /** Used only when NEXT_PUBLIC_SITE_URL is not configured. */
  fallbackOrigin: "https://nureasmir.com",
  /** Shown as the sender name on transactional email / used in WhatsApp templates. */
  emailName: "Nure Asmir",
} as const;

export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || BRAND.fallbackOrigin).replace(/\/$/, "");
}
