import type { ImageLoaderProps } from "next/image";

/**
 * Custom next/image loader. Product/campaign images are served through our own
 * /api/media/[id] and /api/campaign-media/[id] origin routes (reading from private R2), which
 * pre-generate resized WebP variants at upload time (see lib/image-processing.ts) — no paid
 * Cloudflare Images/Image Resizing subscription needed. This loader just appends the requested
 * width so the origin route can pick the smallest variant that still covers it. Static public
 * assets (logo, hero fallback, category stills) have no variants and are served as-is.
 *
 * IMPORTANT: this file must stay lightweight — next/image loaders can run in the browser, so it
 * must NOT import lib/image-processing.ts (which pulls in ~800KB of embedded WASM codec data
 * meant only for the server-side upload pipeline). The width list below is intentionally
 * duplicated rather than shared.
 */
export const STANDARD_WIDTHS = [320, 640, 960, 1280, 1600] as const;

function nearestWidth(requestedWidth: number): number {
  return STANDARD_WIDTHS.find((w) => w >= requestedWidth) ?? STANDARD_WIDTHS[STANDARD_WIDTHS.length - 1];
}

export function cloudflareImageLoader({ src, width }: ImageLoaderProps): string {
  const isDynamicMedia = src.startsWith("/api/media/") || src.startsWith("/api/campaign-media/");
  if (!isDynamicMedia) return src;

  const resolvedWidth = nearestWidth(width);
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}w=${resolvedWidth}`;
}

export function preWarmWidths(): readonly number[] {
  return STANDARD_WIDTHS;
}
