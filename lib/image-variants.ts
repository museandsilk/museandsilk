/**
 * Pure naming/lookup helpers shared by both the client-side upload processor
 * (lib/client-image-processing.ts, runs in the admin's browser) and the server-side media-serving
 * routes (app/api/media/[id], app/api/campaign-media/[id]). No heavy dependencies — safe to import
 * from anywhere, including the deployed Worker, without affecting bundle size.
 */
export const STANDARD_WIDTHS = [320, 640, 960, 1280, 1600] as const;

/** Given an original R2 key like "products/<uuid>.jpg", returns the key a resized WebP variant
 * of the given width is stored under: "products/<uuid>-w640.webp". */
export function variantKeyFor(originalKey: string, width: number): string {
  const withoutExt = originalKey.replace(/\.[^./]+$/, "");
  return `${withoutExt}-w${width}.webp`;
}

/** Picks the smallest generated variant width that is >= the requested width, so we never send a
 * smaller image than what was asked for; falls back to the largest available variant otherwise. */
export function nearestVariantWidth(requestedWidth: number, availableWidths: readonly number[] = STANDARD_WIDTHS): number {
  return availableWidths.find((w) => w >= requestedWidth) ?? availableWidths[availableWidths.length - 1];
}
