import type { Metadata } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { getPublicSettings } from "@/lib/commerce";
import { AnalyticsConsent } from "./analytics-consent";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: { default: "Muse & Silk — Modern scarves, bandanas and eyewear", template: "%s | Muse & Silk" },
    description: "A modern accessories house offering considered scarves, silk bandanas and eyewear, delivered across Pakistan.",
    applicationName: "Muse & Silk",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Muse & Silk — The final layer, considered.",
      description: "Scarves, bandanas and eyewear selected for the way they transform an everyday look.",
      type: "website",
      locale: "en_PK",
      images: [{ url: `${origin}/og.png`, width: 1792, height: 922, alt: "Muse & Silk — The final layer, considered." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Muse & Silk — The final layer, considered.",
      description: "Modern accessories, composed with intention.",
      images: [`${origin}/og.png`],
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getPublicSettings();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://muse-and-silk-store.mohsin-aujla.chatgpt.site";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Muse & Silk",
        url: origin,
        logo: `${origin}/logo.png`,
        ...(settings.instagramUrl ? { sameAs: [settings.instagramUrl] } : {}),
      },
      {
        "@type": "WebSite",
        name: "Muse & Silk",
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
    <html lang="en" className={`${instrumentSerif.variable} ${manrope.variable}`}>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>
        {children}
        <AnalyticsConsent metaPixelId={settings.metaPixelId} gaMeasurementId={settings.gaMeasurementId} />
      </body>
    </html>
  );
}
