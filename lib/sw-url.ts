/** The one service worker (caching + push) — versioned per build so each deploy installs a fresh one. */
export const SW_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID || "dev"}`;
