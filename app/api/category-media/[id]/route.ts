import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getObjectBytes } from "@/lib/r2";
import { nearestVariantWidth, variantKeyFor } from "@/lib/image-variants";
import { matchEdgeCache, putEdgeCache } from "@/lib/edge-cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const cached = await matchEdgeCache(request);
  if (cached) return cached;

  const { id } = await context.params;
  const requestedWidth = Number(new URL(request.url).searchParams.get("w"));

  const [category] = await db
    .select({
      imageR2Key: categories.imageR2Key,
      imageContentType: categories.imageContentType,
      imageVariantWidths: categories.imageVariantWidths,
    })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.status, "active")))
    .limit(1);
  if (!category?.imageR2Key || !category.imageContentType) return new Response("Image not found", { status: 404 });

  if (Number.isFinite(requestedWidth) && requestedWidth > 0 && category.imageVariantWidths?.length) {
    const width = nearestVariantWidth(requestedWidth, category.imageVariantWidths);
    const variant = await getObjectBytes(variantKeyFor(category.imageR2Key, width));
    if (variant) {
      const response = new Response(Buffer.from(variant.body), {
        headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
      });
      await putEdgeCache(request, response.clone());
      return response;
    }
  }

  const object = await getObjectBytes(category.imageR2Key);
  if (!object) return new Response("Image not found", { status: 404 });

  const response = new Response(Buffer.from(object.body), {
    headers: {
      "Content-Type": category.imageContentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  await putEdgeCache(request, response.clone());
  return response;
}
