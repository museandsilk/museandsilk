import { validateImageUpload } from "@/lib/validation";
import { putObject } from "@/lib/r2";
import { variantKeyFor } from "@/lib/image-variants";

/** Reads a pre-made set of WebP variants (fields named `${prefix}variant_{width}`, plus
 * `${prefix}variantWidths` and `${prefix}blurDataUrl`) from an upload form, stores each variant
 * object in R2 under `baseKey`, and returns the widths actually stored. Shared between creating a
 * campaign slide and replacing an existing one's photo — both hand the browser-processed image
 * through in the same shape (see lib/client-image-processing.ts). */
export async function storeVariantsFromForm(
  form: FormData,
  prefix: string,
  baseKey: string,
): Promise<{ widths: number[]; blurDataUrl?: string }> {
  let blurDataUrl: string | undefined;
  const widths: number[] = [];
  const blurField = form.get(`${prefix}blurDataUrl`);
  const variantWidthsField = form.get(`${prefix}variantWidths`);
  if (typeof blurField === "string" && blurField.startsWith("data:image/webp;base64,")) blurDataUrl = blurField;
  if (typeof variantWidthsField === "string") {
    let parsedWidths: unknown;
    try {
      parsedWidths = JSON.parse(variantWidthsField);
    } catch {
      parsedWidths = [];
    }
    if (Array.isArray(parsedWidths)) {
      for (const w of parsedWidths) {
        if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) continue;
        const variantFile = form.get(`${prefix}variant_${w}`);
        if (!(variantFile instanceof File)) continue;
        const variantBytes = new Uint8Array(await variantFile.arrayBuffer());
        const variantValidation = validateImageUpload("image/webp", variantBytes);
        if (!variantValidation.ok) continue;
        await putObject(variantKeyFor(baseKey, w), variantBytes, "image/webp");
        widths.push(w);
      }
    }
  }
  return { widths, blurDataUrl };
}
