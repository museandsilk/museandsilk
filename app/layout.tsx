import type { Metadata } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
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

export function generateMetadata(): Metadata {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return {
    metadataBase: new URL(origin),
    title: { default: "Muse & Silk — Modern scarves, bandanas and eyewear", template: "%s | Muse & Silk" },
    description: "A modern accessories house offering considered scarves, silk bandanas and eyewear, delivered across Pakistan.",
    applicationName: "Muse & Silk",
    icons: {
      icon: [
        { url: "/logo.ico", sizes: "32x32" },
        { url: "/logo-icon.png", type: "image/png", sizes: "512x512" },
      ],
      shortcut: "/logo.ico",
      apple: "/apple-touch-icon.png",
    },
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
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://museandsilk.com";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Muse & Silk",
        alternateName: ["Muse and Silk", "museandsilk"],
        url: origin,
        logo: `${origin}/logo.png`,
        ...(settings.instagramUrl ? { sameAs: [settings.instagramUrl] } : {}),
      },
      {
        "@type": "WebSite",
        name: "Muse & Silk",
        alternateName: ["Muse and Silk", "museandsilk"],
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
