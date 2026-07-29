import type { ImageLoaderProps } from "next/image";

/**
 * Custom next/image loader. Media is served through our own /api/media/[id] origin route (reading
 * from private R2), and resized on the way out using Cloudflare's Workers-path image resizing
 * (/cdn-cgi/image/...) once deployed behind Cloudflare — this avoids a separate Cloudflare Images
 * transform quota. In local dev (no Cloudflare in front of us) it just returns the origin URL,
 * which next/image renders unmodified.
 */
export const STANDARD_WIDTHS = [240, 400, 640, 960, 1440] as const;

function nearestStandardWidth(width: number): number {
  return STANDARD_WIDTHS.find((w) => w >= width) ?? STANDARD_WIDTHS[STANDARD_WIDTHS.length - 1];
}

export function cloudflareImageLoader({ src, width, quality }: ImageLoaderProps): string {
  const resolvedWidth = nearestStandardWidth(width);
  const q = quality ?? 75;
  const isAbsolute = src.startsWith("http");
  const path = isAbsolute ? new URL(src).pathname : src;

  if (process.env.NODE_ENV !== "production") {
    return src;
  }

  const params = `width=${resolvedWidth},quality=${q},format=auto`;
  return `/cdn-cgi/image/${params}${path}`;
}

export function preWarmWidths(): readonly number[] {
  return STANDARD_WIDTHS;
}
