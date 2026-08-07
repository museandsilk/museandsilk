import type { ImageLoaderProps } from "next/image";
import { STANDARD_WIDTHS, nearestVariantWidth } from "./image-variants";

/**
 * Custom next/image loader. Product/category/campaign images are served through our own
 * /api/media/[id], /api/category-media/[id] and /api/campaign-media/[id] origin routes (reading
 * from private R2), which are pre-populated with resized WebP variants generated in the admin's
 * browser at upload time (see lib/client-image-processing.ts) — no paid Cloudflare Images/Image
 * Resizing subscription needed, and no image-codec CPU work ever runs in the deployed Worker.
 * This loader just appends the requested width so the origin route can pick the smallest variant
 * that still covers it. Static public assets (logo, hero fallback, category stills) have no
 * variants and are served as-is.
 */
export function cloudflareImageLoader({ src, width }: ImageLoaderProps): string {
  const isDynamicMedia =
    src.startsWith("/api/media/") || src.startsWith("/api/category-media/") || src.startsWith("/api/campaign-media/");
  if (!isDynamicMedia) return src;

  const resolvedWidth = nearestVariantWidth(width);
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}w=${resolvedWidth}`;
}

export function preWarmWidths(): readonly number[] {
  return STANDARD_WIDTHS;
}
