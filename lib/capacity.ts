/**
 * "How much more can we hold?" – turns today's measured numbers into plain-language headroom, so the developer can see what runs
 * out first and act before it does. Pure functions (no database, no network), so the arithmetic is tested on its own.
 *
 * It is an estimate, not a promise: every assumption is shown next to its answer and can be tuned in one place (ASSUMPTIONS).
 */
export const ASSUMPTIONS = {
  /** Fallback size of one product photo with all its sizes, before any photo has been measured (≈ 5 WebP sizes at web quality). */
  photoBytesFallback: 380 * 1024,
  /** A photo of a sold-out product after "Make them smaller" (800 px + 400 px WebP). */
  shrunkFraction: 0.35,
  /** Typical database space one order uses (order + items + customer + events), in bytes. */
  orderBytesFallback: 6 * 1024,
  /** Database space one product with its variants uses. */
  productBytesFallback: 4 * 1024,
  /** Requests to the Worker for one shopper visit: pages, images that miss the cache, API calls, search. */
  requestsPerVisit: 30,
  /** Share of visits that search through Algolia, and how many searches each of those makes. */
  searchVisitShare: 0.35,
  searchesPerSearcher: 4,
  /** Share of visits that become an order, and the emails each order sends (confirmation, status updates, OTP). */
  orderRate: 0.03,
  emailsPerOrder: 3.5,
  /** Cloudflare Workers free plan. */
  workersRequestsPerDay: 100_000,
} as const;

export type Measured = {
  /** Bytes in use / allowed in each picture store. */
  neon: { used: number; limit: number };
  r2: { used: number; limit: number };
  /** Number of product photos and their total stored size (originals), to learn the real average. */
  photoCount: number;
  photoBytes: number;
  /** Everything measured in both picture stores (all five sizes of every picture, plus other site images). */
  storedBytes: number;
  /** Photos of long sold-out products that could still be made smaller, and what they take. */
  shrinkableCount: number;
  shrinkableBytes: number;
  db: { used: number; limit: number };
  orders: number;
  products: number;
  /** Free daily email allowance across every provider that is set up. */
  emailsPerDay: number;
  /** Free monthly Algolia searches. */
  searchesPerMonth: number;
  /** Free Geoapify lookups per day. */
  lookupsPerDay: number;
};

export type Headroom = { key: string; label: string; unit: string; remaining: number; basis: string };

const nonNegative = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * The average space one product photo takes with all its sizes. Learned from the shop's own storage once there are enough
 * pictures (total measured storage ÷ photos: slightly high because it includes banners and receipts, which keeps the forecast safe).
 */
export function averagePhotoBytes(m: Pick<Measured, "photoCount" | "photoBytes" | "storedBytes">): number {
  if (m.photoCount >= 10 && m.storedBytes > 0) return Math.round(m.storedBytes / m.photoCount);
  // Not measured yet: the stored original is the largest of the five sizes and all five together take about 1.9× that.
  if (m.photoCount >= 10 && m.photoBytes > 0) return Math.round((m.photoBytes / m.photoCount) * 1.9);
  return ASSUMPTIONS.photoBytesFallback;
}

export function predict(m: Measured): { headroom: Headroom[]; weakest: Headroom | null; photos: { more: number; moreAfterShrinking: number; perPhoto: number; freeBytes: number } } {
  const perPhoto = averagePhotoBytes(m);
  const freeBytes = nonNegative(m.neon.limit - m.neon.used) + nonNegative(m.r2.limit - m.r2.used);
  const more = Math.floor(freeBytes / perPhoto);
  const savedByShrinking = m.shrinkableBytes * 1.9 * (1 - ASSUMPTIONS.shrunkFraction);
  const moreAfterShrinking = Math.floor((freeBytes + savedByShrinking) / perPhoto);

  const orderBytes = m.orders >= 50 ? Math.max(2 * 1024, Math.min(20 * 1024, (m.db.used * 0.6) / m.orders)) : ASSUMPTIONS.orderBytesFallback;
  const dbFree = nonNegative(m.db.limit - m.db.used);
  const moreOrders = Math.floor(dbFree / orderBytes);
  const moreProducts = Math.floor(dbFree / ASSUMPTIONS.productBytesFallback);

  const visitsByWorkers = Math.floor(ASSUMPTIONS.workersRequestsPerDay / ASSUMPTIONS.requestsPerVisit);
  const visitsBySearch = Math.floor(m.searchesPerMonth / 30 / (ASSUMPTIONS.searchVisitShare * ASSUMPTIONS.searchesPerSearcher));
  const visitsByEmail = Math.floor(m.emailsPerDay / (ASSUMPTIONS.orderRate * ASSUMPTIONS.emailsPerOrder));
  const visitsByLookups = Math.floor(m.lookupsPerDay / (ASSUMPTIONS.orderRate * 1.5)); // an address search per checkout, a couple of tries

  const headroom: Headroom[] = [
    { key: "photos", label: "More product photos", unit: "photos", remaining: more, basis: `${Math.round(perPhoto / 1024)} KB each (five sizes) in ${(freeBytes / 1024 ** 3).toFixed(1)} GB free` },
    { key: "orders", label: "More orders stored", unit: "orders", remaining: moreOrders, basis: `${(orderBytes / 1024).toFixed(1)} KB per order in ${(dbFree / 1024 ** 2).toFixed(0)} MB free database` },
    { key: "products", label: "More products", unit: "products", remaining: moreProducts, basis: `${ASSUMPTIONS.productBytesFallback / 1024} KB each in the free database space` },
    { key: "visits-workers", label: "Shopper visits a day (website traffic)", unit: "visits/day", remaining: visitsByWorkers, basis: `${ASSUMPTIONS.workersRequestsPerDay.toLocaleString()} free requests a day ÷ ${ASSUMPTIONS.requestsPerVisit} per visit` },
    { key: "visits-search", label: "Shopper visits a day (search allowance)", unit: "visits/day", remaining: visitsBySearch, basis: `${m.searchesPerMonth.toLocaleString()} free searches a month; built-in search takes over after that` },
    { key: "visits-email", label: "Shopper visits a day (email allowance)", unit: "visits/day", remaining: visitsByEmail, basis: `${m.emailsPerDay} free emails a day, ${Math.round(ASSUMPTIONS.orderRate * 100)}% of visits order` },
    { key: "visits-address", label: "Shopper visits a day (address lookups)", unit: "visits/day", remaining: visitsByLookups, basis: `${m.lookupsPerDay.toLocaleString()} free lookups a day` },
  ];

  // The search allowance has a built-in fallback and lookups are optional, so only things that really stop the shop count as "weakest".
  const stopping = headroom.filter((item) => item.key !== "visits-search" && item.key !== "visits-address");
  const weakest = stopping.length ? stopping.reduce((a, b) => (relative(a) <= relative(b) ? a : b)) : null;
  return { headroom, weakest, photos: { more, moreAfterShrinking, perPhoto, freeBytes } };
}

/** A comparable "how soon" score: photos and orders are compared against what a growing shop adds; visits against a busy day. */
function relative(item: Headroom): number {
  const typical: Record<string, number> = { photos: 3000, orders: 20_000, products: 2000, "visits-workers": 5000, "visits-email": 2000 };
  return item.remaining / (typical[item.key] ?? 1000);
}

export function describeAction(item: Headroom): string {
  switch (item.key) {
    case "photos":
      return "Make old sold-out photos smaller (Settings → Advanced), delete pictures nobody needs, or add a third store.";
    case "orders":
    case "products":
      return "Upgrade the Neon database plan, or archive very old orders into a spreadsheet.";
    case "visits-workers":
      return "Move to the Cloudflare Workers paid plan ($5 a month) before a big sale.";
    case "visits-email":
      return "Add a second email account or Brevo (free) so email keeps flowing.";
    default:
      return "";
  }
}
