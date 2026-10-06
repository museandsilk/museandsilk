// Generates the favicon / app-icon / OG / logo files in public/ from the client's wordmark and banners.
// Usage: node ./node_modules/tsx/dist/cli.mjs scripts/build-brand-assets.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = path.join(process.cwd(), "nure_asmir_assets", "web");
const OUT = path.join(process.cwd(), "public");

async function main() {
  await mkdir(path.join(OUT, "brand"), { recursive: true });

  // Wordmark (dark on transparent) + inverted copy for dark backgrounds.
  const wordmark = path.join(SRC, "nure-asmir-wordmark-ink.png");
  await sharp(wordmark).png({ compressionLevel: 9 }).toFile(path.join(OUT, "brand", "wordmark.png"));
  await sharp(wordmark).negate({ alpha: false }).png({ compressionLevel: 9 }).toFile(path.join(OUT, "brand", "wordmark-light.png"));
  await sharp(path.join(SRC, "nure-asmir-lockup-ink.png")).png({ compressionLevel: 9 }).toFile(path.join(OUT, "brand", "lockup.png"));

  // Square icon: the blackletter "N" (first glyph of the wordmark) on white.
  const meta = await sharp(wordmark).metadata();
  const firstLetter = await sharp(wordmark)
    .extract({ left: 0, top: 0, width: Math.round((meta.width ?? 395) * 0.2), height: meta.height ?? 100 })
    .toBuffer();
  const glyph = await sharp(firstLetter).trim().toBuffer();
  async function squareIcon(size: number): Promise<Buffer> {
    const inner = await sharp(glyph).resize({ width: Math.round(size * 0.62), height: Math.round(size * 0.62), fit: "inside" }).toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
      .composite([{ input: inner, gravity: "center" }])
      .png()
      .toBuffer();
  }
  await writeFile(path.join(OUT, "logo-icon.png"), await squareIcon(512));
  await writeFile(path.join(OUT, "apple-touch-icon.png"), await squareIcon(180));
  const png32 = await squareIcon(32);
  // Minimal single-image .ico wrapping a PNG (supported by every modern browser).
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt8(32, 6); header.writeUInt8(32, 7); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png32.length, 14); header.writeUInt32LE(22, 18);
  await writeFile(path.join(OUT, "logo.ico"), Buffer.concat([header, png32]));

  // logo.png is referenced by the Organization JSON-LD: the lockup on white.
  await sharp(path.join(SRC, "nure-asmir-lockup-ink.png"))
    .resize({ width: 800 })
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(path.join(OUT, "logo.png"));

  // Open Graph card 1200x630 from the storefront banner.
  await sharp(path.join(SRC, "banner-storefront.jpg")).resize(1200, 630, { fit: "cover", position: "centre" }).jpeg({ quality: 82 }).toFile(path.join(OUT, "og.jpg"));

  // Neutral placeholder used when a product / category has no photo yet.
  await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 238, g: 236, b: 232 } } })
    .composite([{ input: await sharp(wordmark).resize({ width: 300 }).png().toBuffer(), gravity: "center" }])
    .webp({ quality: 70 })
    .toFile(path.join(OUT, "placeholder.webp"));

  console.log("Brand assets written to public/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
