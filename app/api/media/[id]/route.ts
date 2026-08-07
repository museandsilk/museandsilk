import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { productImages } from "@/db/schema";
import { getObjectBytes } from "@/lib/r2";
import { nearestVariantWidth, variantKeyFor } from "@/lib/image-variants";
import { matchEdgeCache, putEdgeCache } from "@/lib/edge-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const cached = await matchEdgeCache(request);
  if (cached) {
    const debugged = new Response(cached.body, cached);
    debugged.headers.set("X-Debug-Edge-Cache", "HIT");
    return debugged;
  }

  const { id } = await context.params;
  const requestedWidth = Number(new URL(request.url).searchParams.get("w"));

  const [image] = await db
    .select({
      r2Key: productImages.r2Key,
      contentType: productImages.contentType,
      variantWidths: productImages.variantWidths,
    })
    .from(productImages)
    .where(and(eq(productImages.id, id), eq(productImages.status, "active")))
    .limit(1);
  if (!image) return new Response("Image not found", { status: 404 });

  // Serve the smallest pre-generated WebP variant that covers the requested width, if one exists;
  // otherwise fall back to the original upload untouched.
  if (Number.isFinite(requestedWidth) && requestedWidth > 0 && image.variantWidths?.length) {
    const width = nearestVariantWidth(requestedWidth, image.variantWidths);
    const variant = await getObjectBytes(variantKeyFor(image.r2Key, width));
    if (variant) {
      const response = new Response(Buffer.from(variant.body), {
        headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
      });
      const putStatus = await putEdgeCache(request, response.clone());
      response.headers.set("X-Debug-Edge-Cache", "MISS/" + putStatus);
      return response;
    }
  }

  const object = await getObjectBytes(image.r2Key);
  if (!object) return new Response("Image not found", { status: 404 });

  const response = new Response(Buffer.from(object.body), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  const putStatus = await putEdgeCache(request, response.clone());
  response.headers.set("X-Debug-Edge-Cache", "MISS/" + putStatus);
  return response;
}
