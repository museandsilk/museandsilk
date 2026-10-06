import * as Sentry from "@sentry/nextjs";

// Browser-side error + performance monitoring (Sentry project nure-asmir / javascript-nextjs).
// The DSN is public by design; it only allows sending events.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  // Light sampling keeps the free quota intact while still surfacing slow routes.
  tracesSampleRate: 0.1,
  // Storefront visitors are anonymous shoppers: don't attach identity data, IPs or request bodies.
  dataCollection: { userInfo: false },
  ignoreErrors: [
    // Harmless browser noise.
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications.",
    /^Non-Error promise rejection captured/,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
