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
  const url = new URL(request.url);
  const requestedWidth = Number(url.searchParams.get("w"));
  const wantsHero = url.searchParams.get("variant") === "hero";

  const [category] = await db
    .select({
      imageR2Key: categories.imageR2Key,
      imageContentType: categories.imageContentType,
      imageVariantWidths: categories.imageVariantWidths,
      heroR2Key: categories.heroR2Key,
      heroContentType: categories.heroContentType,
      heroVariantWidths: categories.heroVariantWidths,
    })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.status, "active")))
    .limit(1);
  if (!category) return new Response("Image not found", { status: 404 });

  // Fall back to the card image whenever no separate hero crop was ever set, so categories
  // created before this feature existed keep working unchanged.
  const useHero = wantsHero && !!category.heroR2Key;
  const r2Key = useHero ? category.heroR2Key : category.imageR2Key;
  const contentType = useHero ? category.heroContentType : category.imageContentType;
  const variantWidths = useHero ? category.heroVariantWidths : category.imageVariantWidths;
  if (!r2Key || !contentType) return new Response("Image not found", { status: 404 });

  if (Number.isFinite(requestedWidth) && requestedWidth > 0 && variantWidths?.length) {
    const width = nearestVariantWidth(requestedWidth, variantWidths);
    const variant = await getObjectBytes(variantKeyFor(r2Key, width));
    if (variant) {
      const response = new Response(Buffer.from(variant.body), {
        headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
      });
      putEdgeCache(request, response.clone());
      return response;
    }
  }

  const object = await getObjectBytes(r2Key);
  if (!object) return new Response("Image not found", { status: 404 });

  const response = new Response(Buffer.from(object.body), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  putEdgeCache(request, response.clone());
  return response;
}
