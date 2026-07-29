import type { ImageLoaderProps } from "next/image";

/**
 * Custom next/image loader. Media is served through our own /api/media/[id] origin route (reading
 * from private R2). We deliberately do NOT proxy through Cloudflare's Workers-path image resizing
 * (/cdn-cgi/image/...) — that feature requires a paid Cloudflare plan (Pro, $20/mo+) and is not
 * enabled on this account's free/Workers-only plan; every request through it 404s. Until product
 * images are pre-sized on upload (or a Cloudflare Images subscription is added — ~$5/mo for
 * 100k images — as a deliberate upgrade), images are served at their original uploaded size.
 */
export const STANDARD_WIDTHS = [240, 400, 640, 960, 1440] as const;

export function cloudflareImageLoader({ src }: ImageLoaderProps): string {
  return src;
}

export function preWarmWidths(): readonly number[] {
  return STANDARD_WIDTHS;
}
