"use client";

import { STANDARD_WIDTHS } from "./image-variants";

const BLUR_WIDTH = 20;
const QUALITY = 0.78;
const BLUR_QUALITY = 0.2;

export type ImageVariant = { width: number; blob: Blob };
export type ProcessedImage = {
  width: number;
  height: number;
  variants: ImageVariant[];
  blurDataUrl: string;
};

function encodeAtWidth(bitmap: ImageBitmap, targetWidth: number, quality: number): Promise<Blob> {
  const targetHeight = Math.max(1, Math.round((bitmap.height / bitmap.width) * targetWidth));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas WebP export failed"))),
      "image/webp",
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Decodes an image file picked in the admin panel, resizes it to standard breakpoints (never
 * upscaling past the original), and re-encodes each as WebP — entirely in the browser via the
 * Canvas API (natively supported decode + WebP encode in every modern browser, no libraries
 * needed). Also produces a tiny heavily-compressed WebP placeholder for a blur-up loading effect.
 *
 * This runs on the admin's own machine at upload time specifically so the deployed Cloudflare
 * Worker never has to do real CPU-heavy image work — Workers' free-tier CPU-time-per-request
 * budget (10ms) is far too small for image codec work, and this sidesteps that entirely.
 *
 * Returns null (never throws) if anything goes wrong — callers should fall back to uploading only
 * the original file.
 */
export async function processImageClientSide(file: File): Promise<ProcessedImage | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;

    const variants: ImageVariant[] = [];
    for (const targetWidth of STANDARD_WIDTHS) {
      if (targetWidth >= width) {
        variants.push({ width, blob: await encodeAtWidth(bitmap, width, QUALITY) });
        break;
      }
      variants.push({ width: targetWidth, blob: await encodeAtWidth(bitmap, targetWidth, QUALITY) });
    }

    const blurBlob = await encodeAtWidth(bitmap, Math.min(BLUR_WIDTH, width), BLUR_QUALITY);
    const blurDataUrl = await blobToDataUrl(blurBlob);

    bitmap.close();
    return { width, height, variants, blurDataUrl };
  } catch (error) {
    console.error("Client-side image processing failed — falling back to the original upload only", error);
    return null;
  }
}
