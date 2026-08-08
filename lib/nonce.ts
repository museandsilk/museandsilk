/**
 * A fixed CSP nonce, read from a Worker secret — deliberately NOT a fresh per-request value.
 *
 * The textbook version of nonce-based CSP generates a new random nonce on every single request.
 * That's incompatible with this app's persistent ISR page cache (see open-next.config.ts): a
 * cached page's HTML has whatever nonce was current at the moment it was generated baked into its
 * <script> tags, but a *fresh* per-request nonce in middleware.ts's CSP header would only ever
 * match the page generated in that same request — every cache hit (the vast majority of page
 * views) would have a header nonce that doesn't match its cached script tags, and the browser
 * would silently block every inline script on the page: JSON-LD structured data, and potentially
 * the GA/Meta Pixel bootstrap snippets too.
 *
 * A fixed, secret nonce sidesteps that entirely — it's the same value regardless of when a page
 * was generated or served from cache, so it never mismatches. It's a weaker guarantee than a true
 * per-request nonce (an attacker who somehow learns this value could construct a script that
 * passes CSP until the next rotation), but it still blocks the overwhelmingly common case — a
 * generic injected <script> with no knowledge of this app's specific nonce — which is exactly what
 * 'unsafe-inline' alone does not do. Rotate by changing the CSP_NONCE secret and redeploying if
 * it's ever suspected of leaking.
 */
export function getNonce(): string {
  return process.env.CSP_NONCE || "";
}
