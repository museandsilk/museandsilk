import decodeJpeg, { init as initJpegDecodeCodec } from "@jsquash/jpeg/decode";
import decodePng, { init as initPngDecodeCodec } from "@jsquash/png/decode";
import decodeWebp, { init as initWebpDecodeCodec } from "@jsquash/webp/decode";
import encodeWebp, { init as initWebpEncodeCodec } from "@jsquash/webp/encode";
import resizeImageData, { initResize as initResizeCodec } from "@jsquash/resize";

import { jpegDecWasmBase64 } from "./wasm/jpeg-dec-wasm";
import { pngDecWasmBase64 } from "./wasm/png-dec-wasm";
import { webpDecWasmBase64 } from "./wasm/webp-dec-wasm";
import { webpEncWasmBase64 } from "./wasm/webp-enc-wasm";
import { resizeWasmBase64 } from "./wasm/resize-wasm";

/**
 * All codec WASM binaries are embedded as base64 (see lib/wasm/*) rather than imported as raw
 * .wasm files. This is deliberate: it guarantees identical behavior across `next dev` (plain
 * Node), the production build, and the deployed Cloudflare Worker, without depending on any
 * bundler's WASM-import handling (which differs across environments and is hard to verify without
 * a working local Cloudflare build on this machine). The cost is a larger source bundle; the
 * benefit is that this either works everywhere or fails everywhere, with a clear stack trace.
 */
function base64ToWasmModule(base64: string): Promise<WebAssembly.Module> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return WebAssembly.compile(buffer);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

let jpegDecodeReady: Promise<void> | null = null;
async function ensureJpegDecode(): Promise<void> {
  if (!jpegDecodeReady) {
    jpegDecodeReady = base64ToWasmModule(jpegDecWasmBase64).then((mod) => initJpegDecodeCodec(mod));
  }
  await jpegDecodeReady;
}

let pngDecodeReady: Promise<unknown> | null = null;
async function ensurePngDecode(): Promise<void> {
  if (!pngDecodeReady) {
    pngDecodeReady = base64ToWasmModule(pngDecWasmBase64).then((mod) => initPngDecodeCodec(mod));
  }
  await pngDecodeReady;
}

let webpDecodeReady: Promise<void> | null = null;
async function ensureWebpDecode(): Promise<void> {
  if (!webpDecodeReady) {
    webpDecodeReady = base64ToWasmModule(webpDecWasmBase64).then((mod) => initWebpDecodeCodec(mod));
  }
  await webpDecodeReady;
}

let webpEncodeReady: Promise<unknown> | null = null;
async function ensureWebpEncode(): Promise<void> {
  if (!webpEncodeReady) {
    webpEncodeReady = base64ToWasmModule(webpEncWasmBase64).then((mod) => initWebpEncodeCodec(mod));
  }
  await webpEncodeReady;
}

let resizeReady: Promise<unknown> | null = null;
async function ensureResize(): Promise<void> {
  if (!resizeReady) {
    resizeReady = base64ToWasmModule(resizeWasmBase64).then((mod) => initResizeCodec(mod));
  }
  await resizeReady;
}

async function decodeToImageData(bytes: Uint8Array, contentType: string): Promise<ImageData> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  if (contentType === "image/png") {
    await ensurePngDecode();
    return decodePng(buffer);
  }
  if (contentType === "image/webp") {
    await ensureWebpDecode();
    return decodeWebp(buffer);
  }
  await ensureJpegDecode();
  return decodeJpeg(buffer);
}

export const STANDARD_WIDTHS = [320, 640, 960, 1280, 1600] as const;
const BLUR_WIDTH = 20;
const QUALITY = 78;

export type ImageVariant = { width: number; bytes: Uint8Array };
export type ProcessedImage = {
  width: number;
  height: number;
  variants: ImageVariant[];
  blurDataUrl: string;
};

/**
 * Decodes an uploaded image, produces a set of resized WebP variants at standard breakpoints
 * (never upscaling past the original), plus a tiny heavily-compressed WebP placeholder for a
 * blur-up loading effect. Returns null (never throws) if decoding/encoding fails for any reason —
 * callers should fall back to storing only the original upload, so a bad/unusual image file never
 * breaks the admin upload flow.
 */
export async function processUploadedImage(bytes: Uint8Array, contentType: string): Promise<ProcessedImage | null> {
  try {
    const imageData = await decodeToImageData(bytes, contentType);
    await ensureResize();
    await ensureWebpEncode();

    const variants: ImageVariant[] = [];
    for (const width of STANDARD_WIDTHS) {
      if (width >= imageData.width) {
        const encoded = await encodeWebp(imageData, { quality: QUALITY });
        variants.push({ width: imageData.width, bytes: new Uint8Array(encoded) });
        break;
      }
      const height = Math.max(1, Math.round((imageData.height / imageData.width) * width));
      const resized = await resizeImageData(imageData, { width, height });
      const encoded = await encodeWebp(resized, { quality: QUALITY });
      variants.push({ width, bytes: new Uint8Array(encoded) });
    }

    const blurHeight = Math.max(1, Math.round((imageData.height / imageData.width) * BLUR_WIDTH));
    const blurImage = await resizeImageData(imageData, { width: BLUR_WIDTH, height: blurHeight });
    const blurEncoded = await encodeWebp(blurImage, { quality: 20 });
    const blurDataUrl = `data:image/webp;base64,${bytesToBase64(new Uint8Array(blurEncoded))}`;

    return { width: imageData.width, height: imageData.height, variants, blurDataUrl };
  } catch (error) {
    console.error("Image processing failed — falling back to storing the original upload only", error);
    return null;
  }
}

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
