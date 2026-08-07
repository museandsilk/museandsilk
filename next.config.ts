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
      `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://www.googletagmanager.com https://connect.facebook.net https://static.cloudflareinsights.com`,
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      `connect-src 'self' ${isDev ? "ws:" : ""} https://www.google-analytics.com https://connect.facebook.net https://cloudflareinsights.com`,
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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
