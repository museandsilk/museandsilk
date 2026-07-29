const IMAGE_SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"; WEBP marker follows at offset 8
];

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_PROOF_BYTES = 8 * 1024 * 1024; // 8MB

export type FileValidationResult = { ok: true } | { ok: false; error: string };

function sniffImageMime(bytes: Uint8Array): string | null {
  for (const sig of IMAGE_SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (bytes.length < offset + sig.bytes.length) continue;
    const matches = sig.bytes.every((b, i) => bytes[offset + i] === b);
    if (matches) {
      if (sig.mime === "image/webp") {
        const marker = String.fromCharCode(...bytes.slice(8, 12));
        if (marker !== "WEBP") continue;
      }
      return sig.mime;
    }
  }
  return null;
}

/** Validates an uploaded product/campaign image: declared MIME type must be an allowed image type,
 * size must be within bounds, and the actual file bytes must start with a matching magic-number
 * signature (rejects a renamed .exe or script masquerading as a .jpg). */
export function validateImageUpload(declaredType: string, bytes: Uint8Array): FileValidationResult {
  if (!ALLOWED_IMAGE_MIME.has(declaredType)) {
    return { ok: false, error: "Only JPEG, PNG or WebP images are accepted." };
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image must be between 1 byte and 10MB." };
  }
  const sniffed = sniffImageMime(bytes);
  if (!sniffed || sniffed !== declaredType) {
    return { ok: false, error: "File contents do not match the declared image type." };
  }
  return { ok: true };
}

export function validatePaymentProofUpload(declaredType: string, bytes: Uint8Array): FileValidationResult {
  if (!ALLOWED_IMAGE_MIME.has(declaredType)) {
    return { ok: false, error: "Only JPEG, PNG or WebP receipts are accepted." };
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PROOF_BYTES) {
    return { ok: false, error: "Receipt image must be between 1 byte and 8MB." };
  }
  const sniffed = sniffImageMime(bytes);
  if (!sniffed || sniffed !== declaredType) {
    return { ok: false, error: "File contents do not match the declared image type." };
  }
  return { ok: true };
}
