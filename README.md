# Nure Asmir — storefront & admin

Pakistani men's wear e-commerce site ("Tradition in a modern form"): Next.js 16 (App Router) on
Cloudflare Workers via OpenNext, Neon Postgres + Object Storage + Auth, Algolia search, PostEx
couriers, WhatsApp order confirmation. The storefront design follows the *Ismail Farid* benchmark:
a calm, white, image-led layout.

## Stack

| Concern | Service |
| --- | --- |
| Hosting / CDN / WAF | Cloudflare Workers (OpenNext) + Cloudflare edge cache |
| Database | Neon Postgres (`neondb`, Singapore `ap-southeast-1`) via Drizzle + `neon-http` |
| Images & files | Neon Object Storage — `nure-asmir-media` (public) and `nure-asmir-private` (payment proofs) |
| Auth | Neon Auth (Managed Better Auth) is enabled on the project; the admin panel currently uses its own session auth (`lib/auth`) |
| Search | Algolia (`nure_asmir_products`), instant overlay + `/search` |
| Currency | Frankfurter API (display only — orders are charged in PKR) |
| Errors | Sentry (browser SDK + lightweight server reporter) |
| Email / WhatsApp / courier | Resend / WhatsApp Cloud API / PostEx |

Next.js 16 has breaking changes versus older versions — read `node_modules/next/dist/docs/` before
changing framework-level code (see `AGENTS.md`).

## Local development

```bash
npm install
cp .env.example .env.local        # then fill in (or `neon env pull` for the Neon values)
npm run db:migrate                # apply Drizzle migrations to the Neon branch in .env.local
npm run db:seed                   # admin owner, settings, categories, catalogue, banners (uploads photos)
npm run search:reindex            # push the catalogue into Algolia
npm run dev                       # http://localhost:3000
```

> On Windows the in-app browser may force https for `localhost`; use `http://anything.localhost:3000`.

Useful scripts: `npm run cf:preview` (run the real Worker bundle locally), `npm run brand:assets`
(regenerate favicon / OG / logo files from `nure_asmir_assets/web`), `npm run db:generate` after a
schema change.

## Images: conversion, storage and CDN

* Every upload is converted to a ladder of WebP widths (320 / 640 / 960 / 1280 / 1600, never
  upscaled) plus a blur placeholder. In the admin this happens **in the browser**
  (`lib/client-image-processing.ts`) so the Worker does no codec work; `scripts/seed.ts` does the same
  with `sharp`.
* Originals and variants are stored in the Neon public bucket under random UUID keys that are never
  overwritten → safe to cache forever (`Cache-Control: public, max-age=31536000, immutable`).
* `lib/media-url.ts` builds the URLs and `lib/images.ts` is the `next/image` loader: it picks the
  smallest variant that covers the rendered width straight from the key (no DB lookup, no image
  service).
* Delivery: by default through `/cdn/*` (`app/cdn/[...key]/route.ts`), which streams from the bucket
  with Cloudflare's edge cache forced on (`cf.cacheEverything`, 1 year). For the lowest latency set
  `NEXT_PUBLIC_CDN_URL=https://cdn.<domain>` and run `scripts/cloudflare-harden.ts` — it creates a
  proxied `cdn` hostname whose origin rule points at the bucket, so images never touch the Worker.
* Orphans are cleaned daily by `scripts/storage-audit.ts` (GitHub Action *Storage orphan cleanup*).

## Neon

`neon.ts` declares the services (auth + the two buckets); apply with `neon deploy`. The project is
linked in `.neon` (git-ignored): project `blue-bread-34552165`, branch `production`.

## Search

`lib/search/algolia.ts` builds records, settings and synonyms (kameez/qameez, tee/t-shirt…). Admin
product/variant/image/category routes re-index on change; a nightly workflow calls
`/api/cron/search-reindex`. The browser only ever sees the **search-only** key.

## Two deployables, one repo

The customer storefront and the owner's admin panel are built and deployed as **separate Cloudflare Workers**
(`scripts/build-target.mjs`): `nure-asmir` (storefront, no admin code in the bundle) and
`nure-asmir-admin` (admin panel, own origin/cookies, `X-Robots-Tag: noindex`). Shoppers never download
admin code or admin CSS (`app/admin/admin.css` is loaded only by the admin layout); the storefront footer
links to the admin URL (`NEXT_PUBLIC_ADMIN_URL`) and nothing of it loads until that link is opened.
`npm run dev`, tests and a plain `next build` still run the whole app on one origin.

```bash
npm run cf:build:store     # → .open-next, deploy with: npx wrangler deploy -c wrangler.jsonc
npm run cf:build:admin     # → .open-next, deploy with: npx wrangler deploy -c wrangler.admin.jsonc
```

## Shopper experience details

* **Never oversold.** Stock is reserved with a guarded `UPDATE … WHERE stock − reserved ≥ qty`; a
  reservation is released on cancel / expiry, converted to a sale on delivery, and a 5-minute cron repairs
  any drift (`reconcileReservedStock`). Checkout is idempotent per bag (a dropped connection or a closed tab
  can never create a second order).
* **Flash sales** (admin → Flash sales): percentage / fixed discounts over a time window for chosen products or
  everything. The *server* decides the price at order time; pages show a countdown and a −% badge. When a
  sale goes live the cron pushes to shoppers who saved the product (wishlist) or asked for sale alerts.
* **Wishlist** (browser-local, optional push for sale alerts) and **order updates** (paid / on its way /
  delivered / cancelled) by push (Firebase) and email.
* **Owner alerts** (admin push): new orders, payment receipts, low stock, out of stock.
* **Browser cache**: `public/sw.js` – stale-while-revalidate pages (5 min fresh, then network-first; 7-day offline fallback), immutable chunks/images, 10-minute
  API cache, offline fallback, per-deploy cache versioning; never caches admin/API/cart/checkout/tracking.

## Testing

```bash
npx playwright install            # once
npm run test:e2e                  # unit + API/race + UI on 7 device profiles
npx playwright test --project=api # server-side: last-piece races, idempotency, pricing, push (mock FCM)
npx playwright test --project=mobile-safari --project=small-android e2e/ui/layout.spec.ts
# service-worker / cache behaviour needs a production build:
NEXT_DIST_DIR=.next-prod npx next build && E2E_PROD=1 npx playwright test --project=pwa
```

The suite refuses to run unless `DATABASE_URL` points at the disposable Neon branch `e2e-test` (set in the
git-ignored `.env.development.local`); Algolia, email, WhatsApp and PostEx are switched off for it and push
notifications go to a local mock of Google's OAuth + FCM endpoints (`e2e/support/mock-fcm.mjs`).

## Deployment (GitHub Actions → Cloudflare)

* `development` → CI (`.github/workflows/ci.yml`: tsc, eslint, OpenNext build) and CodeRabbit review.
* `main` → `.github/workflows/deploy.yml` builds and `wrangler deploy`s.
* Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL`,
  `NEXT_PUBLIC_SITE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`, `CSP_NONCE`,
  `CRON_SECRET`, `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
  `ALGOLIA_APP_ID`, `ALGOLIA_ADMIN_KEY`, `ALGOLIA_INDEX_NAME`, `NEXT_PUBLIC_ALGOLIA_SEARCH_KEY`,
  `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_CDN_URL` (optional), plus the Resend / WhatsApp / PostEx /
  Turnstile ones listed in `.env.example`, and `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` (S3 credentials for the ISR cache bucket only, used by `scripts/purge-isr-cache.ts`).
* The ISR page cache lives in a small Cloudflare R2 bucket, `nure-asmir-cache`
  (`npx wrangler r2 bucket create nure-asmir-cache`; the workflow does this idempotently).
* The Worker bundle must stay under Cloudflare's 3 MB gzip limit on the free plan (currently
  ≈2.9 MB) — which is why storage uses `aws4fetch` instead of the AWS SDK and Sentry's full Node SDK
  is not bundled server-side. Check with `npx wrangler deploy --dry-run` after adding dependencies.

## Cloudflare security (free plan)

`npx tsx scripts/cloudflare-harden.ts --zone <zone-id> [--apply]` (needs `CLOUDFLARE_API_TOKEN`)
configures: Full (strict) TLS, always-HTTPS, TLS ≥ 1.2, HSTS, Bot Fight Mode, browser integrity
check, managed WAF rules, a custom rule set, a login/checkout rate limit and the long-lived cache rule
for `/cdn/*`. Without `--apply` it only prints what it would do.

## Content to confirm with the client

Prices, sizes, stock levels, product copy and the policy pages (shipping, returns, privacy, terms)
are working placeholders — edit them in the admin panel. The leather wallet / card-holder photos
supplied show another brand's logo, so those two products are seeded as **draft**.
