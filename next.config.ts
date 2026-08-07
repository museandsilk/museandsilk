import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // blob: is required for the admin campaign-image cropper, which previews the picked file
      // via URL.createObjectURL() entirely client-side before anything is uploaded.
      "img-src 'self' data: blob: https:",
      // 'unsafe-eval' is required by React Fast Refresh in dev only — never present in production.
      // static.cloudflareinsights.com is Cloudflare's own Web Analytics beacon, auto-injected into
      // every response by the zone itself (not something this app adds) — without it allowlisted
      // here, the browser silently blocks it and logs a CSP violation on every page load.
      `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://www.googletagmanager.com https://connect.facebook.net https://static.cloudflareinsights.com https://challenges.cloudflare.com`,
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      `connect-src 'self' ${isDev ? "ws:" : ""} https://www.google-analytics.com https://connect.facebook.net https://cloudflareinsights.com https://challenges.cloudflare.com`,
      // Turnstile's checkout widget renders inside an iframe served from challenges.cloudflare.com.
      "frame-src https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",
  },
  async headers() {
    return [
      // Content-hashed build assets (a new filename every deploy — see scripts/purge-isr-cache.ts)
      // never change once built, so they're safe to cache for a year. Without this, the broad
      // "/:path*" rule below was the only thing touching these responses, which left them on
      // whatever Cache-Control the platform defaults to for an unmatched-by-name static response —
      // `max-age=0, must-revalidate`, forcing a revalidation request on every single load of every
      // JS/CSS chunk on every page view.
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
