import type { ImageLoaderProps } from "next/image";
import { STANDARD_WIDTHS, nearestVariantWidth } from "./image-variants";
import { cdnSrcForWidth, cdnSrcSet, isCdnUrl } from "./media-url";

/**
 * Custom next/image loader — no image-resizing subscription, no codec work in the Worker.
 * Every upload is converted to a ladder of WebP widths up front (in the admin's browser, or by
 * scripts/seed.ts), so "optimisation" is just picking the right pre-made file:
 *   - CDN URLs (lib/media-url.ts) resolve straight to the variant object in the bucket, cached
 *     forever at Cloudflare's edge.
 *   - Legacy /api/media|category-media|campaign-media routes (admin previews, feeds) still take a
 *     `?w=` width.
 *   - Anything else (static /public assets) is served as-is.
 */
export function cloudflareImageLoader({ src, width }: ImageLoaderProps): string {
  if (isCdnUrl(src)) return cdnSrcForWidth(src, width);

  const isLegacyMedia =
    src.startsWith("/api/media/") || src.startsWith("/api/category-media/") || src.startsWith("/api/campaign-media/");
  if (!isLegacyMedia) return src;

  const resolvedWidth = nearestVariantWidth(width);
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}w=${resolvedWidth}`;
}

export function preWarmWidths(): readonly number[] {
  return STANDARD_WIDTHS;
}

/** Builds a width-descriptor srcset — used with a raw <picture><source media="…"> pair wherever a
 * page needs a genuinely different crop per breakpoint (next/image doesn't render <picture>). */
export function buildSrcSet(url: string): string {
  if (isCdnUrl(url)) return cdnSrcSet(url);
  return STANDARD_WIDTHS.map((width) => `${url}${url.includes("?") ? "&" : "?"}w=${width} ${width}w`).join(", ");
}
