import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";
import "./storefront.css";
import { BRAND, siteOrigin } from "@/lib/brand";
import { getPublicSettings } from "@/lib/commerce";
import { getNonce } from "@/lib/nonce";
import { AnalyticsConsent } from "./analytics-consent";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const sans = Jost({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw edge to edge on notched phones; floating widgets add the safe-area insets themselves.
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export function generateMetadata(): Metadata {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const title = `${BRAND.name} — ${BRAND.descriptor}`;
  return {
    metadataBase: new URL(origin),
    title: { default: `${title}. ${BRAND.tagline}.`, template: `%s | ${BRAND.name}` },
    description: BRAND.description,
    applicationName: BRAND.name,
    icons: {
      icon: [
        { url: "/logo.ico", sizes: "32x32" },
        { url: "/logo-icon.png", type: "image/png", sizes: "512x512" },
      ],
      shortcut: "/logo.ico",
      apple: "/apple-touch-icon.png",
    },
    openGraph: {
      title: `${title} — ${BRAND.tagline}`,
      description: BRAND.description,
      type: "website",
      locale: "en_PK",
      siteName: BRAND.name,
      images: [{ url: `${origin}/og.jpg`, width: 1200, height: 630, alt: `${BRAND.name} — ${BRAND.tagline}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${BRAND.tagline}`,
      description: BRAND.description,
      images: [`${origin}/og.jpg`],
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getPublicSettings();
  const nonce = getNonce();
  const origin = siteOrigin();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: BRAND.name,
        url: origin,
        logo: `${origin}/logo.png`,
        ...(settings.instagramUrl ? { sameAs: [settings.instagramUrl] } : {}),
      },
      {
        "@type": "WebSite",
        name: BRAND.name,
        url: origin,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${origin}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${display.variable} ${sans.variable}`}>
      <head>
        <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>
        {children}
        <AnalyticsConsent metaPixelId={settings.metaPixelId} gaMeasurementId={settings.gaMeasurementId} nonce={nonce} />
      </body>
    </html>
  );
}
