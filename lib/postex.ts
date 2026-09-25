// PostEx (Pakistani COD courier) API client — see "Merchant API Integration Guide v4.1.9".
//
// Auth is a single merchant token sent in a `token` request header. Everything here is server-only:
// the token must never reach the browser, so the admin UI talks to our own /api/admin routes,
// which call these helpers. Best-effort and inert by default, like the other optional integrations
// in this codebase (WhatsApp, Resend, Turnstile): with POSTEX_API_TOKEN unset, isPostexConfigured()
// is false and the admin UI simply doesn't offer courier booking.

const BASE = "https://api.postex.pk/services/integration/api/order";
const TIMEOUT_MS = 20_000;

export function isPostexConfigured(): boolean {
  return Boolean(process.env.POSTEX_API_TOKEN);
}

export class PostexError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PostexError";
  }
}

async function postexFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = process.env.POSTEX_API_TOKEN;
  if (!token) throw new PostexError("PostEx is not configured (POSTEX_API_TOKEN is not set).");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: { token, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new PostexError("PostEx did not respond in time. Please try again.");
    }
    throw new PostexError("Could not reach PostEx. Please try again.");
  } finally {
    clearTimeout(timer);
  }
}

type PostexEnvelope<T> = { statusCode?: string | number; statusMessage?: string; dist?: T };

async function postexJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await postexFetch(path, init);
  const body = (await response.json().catch(() => null)) as PostexEnvelope<T> | null;
  // PostEx reports success as statusCode "200" inside the JSON body (as a string), alongside the
  // HTTP status — check both, since a 200 HTTP response can still carry a failure statusCode.
  if (!response.ok || !body || String(body.statusCode) !== "200") {
    throw new PostexError(body?.statusMessage || `PostEx request failed (HTTP ${response.status}).`, response.status);
  }
  return body.dist as T;
}

// ---------------------------------------------------------------------------------------------
// Phone / city / order-detail mapping helpers (pure — no network)
// ---------------------------------------------------------------------------------------------

/** PostEx wants Pakistani mobile numbers as 03xxxxxxxxx. Checkout stores whatever the customer
 * typed ("+92300…", "92300…", "0300…", with spaces/dashes), so normalize, and return null when it
 * still isn't a valid mobile number (a landline, or an email-only order with no phone at all) so the
 * caller can ask the admin for a correct one instead of sending PostEx garbage. */
export function toPostexPhone(rawPhone: string): string | null {
  const digits = rawPhone.replace(/\D/g, "");
  let local: string;
  if (digits.startsWith("92")) local = `0${digits.slice(2)}`;
  else if (digits.startsWith("0")) local = digits;
  else local = `0${digits}`;
  return /^03\d{9}$/.test(local) ? local : null;
}

const normalizeCity = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** Best PostEx delivery city for the free-text city a customer typed at checkout: exact match
 * (case/space-insensitive) first, then a containment match either way ("DHA Lahore" → "Lahore").
 * Null when nothing plausible matches — the admin then picks one from the list. */
export function suggestCity(customerCity: string, deliveryCities: string[]): string | null {
  const wanted = normalizeCity(customerCity);
  if (!wanted) return null;
  const exact = deliveryCities.find((city) => normalizeCity(city) === wanted);
  if (exact) return exact;
  // PostEx lists ~900 cities incl. many short/area names, so among loose matches prefer the longest
  // (most specific) one rather than whichever happens to sort first.
  const partial = deliveryCities
    .filter((city) => {
      const candidate = normalizeCity(city);
      return wanted.includes(candidate) || candidate.includes(wanted);
    })
    .sort((a, b) => b.length - a.length);
  return partial[0] ?? null;
}

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export function buildOrderDetail(items: Array<{ productName: string; variantName: string; quantity: number }>): string {
  return clip(
    items
      .map((item) => `${item.quantity}× ${item.productName}${item.variantName && item.variantName !== item.productName ? ` (${item.variantName})` : ""}`)
      .join("; "),
    300,
  );
}

export function buildNotes(orderNumber: string, notes: string | null, deliveryNotes: string | null): string {
  return clip([`Order ${orderNumber}`, notes, deliveryNotes].filter(Boolean).join(" — "), 250);
}

// ---------------------------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------------------------

export type PostexCity = { operationalCityName: string; isPickupCity: boolean; isDeliveryCity: boolean };

/** Cities PostEx delivers to. Checkout accepts a free-text city, so booking must map it onto this
 * list — PostEx rejects a city name it doesn't recognise. */
export async function getDeliveryCities(): Promise<string[]> {
  // NB: the guide documents "Delivery", but the live API rejects that with HTTP 400 and only
  // accepts lowercase "delivery" (verified against the real endpoint). City names come back in
  // UPPERCASE ("LAHORE"), so callers must match case-insensitively — see suggestCity.
  const cities = await postexJson<Array<{ operationalCityName: string; isDeliveryCity?: boolean | string }>>(
    "/v2/get-operational-city?operationalCityType=delivery",
  );
  return cities
    .filter((city) => String(city.isDeliveryCity) !== "false")
    .map((city) => city.operationalCityName)
    .sort((a, b) => a.localeCompare(b));
}

export type PostexPickupAddress = {
  addressCode: string;
  address: string;
  cityName: string;
  contactPersonName: string;
  phone1: string;
};

export async function getPickupAddresses(): Promise<PostexPickupAddress[]> {
  return postexJson<PostexPickupAddress[]>("/v1/get-merchant-address");
}

export type CreatePostexOrderInput = {
  cityName: string;
  customerName: string;
  customerPhone: string; // 03xxxxxxxxx
  deliveryAddress: string;
  invoicePayment: number; // cash to collect on delivery, PKR — 0 for an already-paid order
  items: number; // number of pieces
  orderDetail: string;
  orderRefNumber: string;
  transactionNotes: string;
  pickupAddressCode?: string;
};

export async function createPostexOrder(input: CreatePostexOrderInput): Promise<{ trackingNumber: string; orderStatus: string }> {
  const dist = await postexJson<{ trackingNumber?: string; orderStatus?: string }>("/v3/create-order", {
    method: "POST",
    body: JSON.stringify({ ...input, invoiceDivision: 1, orderType: "Normal" }),
  });
  if (!dist?.trackingNumber) throw new PostexError("PostEx accepted the order but returned no tracking number.");
  return { trackingNumber: dist.trackingNumber, orderStatus: dist.orderStatus ?? "UnBooked" };
}

export type PostexTracking = {
  transactionStatus: string | null;
  transactionStatusHistory: Array<{ transactionStatusMessage: string; transactionStatusMessageCode: string }>;
};

export async function trackPostexOrder(trackingNumber: string): Promise<PostexTracking> {
  const dist = await postexJson<Partial<PostexTracking>>(`/v1/track-order/${encodeURIComponent(trackingNumber)}`);
  return {
    transactionStatus: dist?.transactionStatus ?? null,
    transactionStatusHistory: dist?.transactionStatusHistory ?? [],
  };
}

export async function cancelPostexOrder(trackingNumber: string): Promise<void> {
  const response = await postexFetch("/v1/cancel-order", { method: "PUT", body: JSON.stringify({ trackingNumber }) });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { statusMessage?: string } | null;
    throw new PostexError(
      response.status === 404 ? "PostEx could not find that order." : body?.statusMessage || `PostEx could not cancel the order (HTTP ${response.status}).`,
      response.status,
    );
  }
}

/** The printable airway bill (shipping label) PDF for one parcel, as raw bytes. */
export async function getAirwayBillPdf(trackingNumber: string): Promise<ArrayBuffer> {
  const response = await postexFetch(`/v1/get-invoice?trackingNumbers=${encodeURIComponent(trackingNumber)}`);
  if (!response.ok) throw new PostexError(`PostEx could not generate the airway bill (HTTP ${response.status}).`, response.status);
  return response.arrayBuffer();
}
