import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignSlides } from "@/db/schema";
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
  const wantsMobile = url.searchParams.get("variant") === "mobile";

  const [slide] = await db
    .select({
      r2Key: campaignSlides.r2Key,
      contentType: campaignSlides.contentType,
      variantWidths: campaignSlides.variantWidths,
      mobileR2Key: campaignSlides.mobileR2Key,
      mobileContentType: campaignSlides.mobileContentType,
      mobileVariantWidths: campaignSlides.mobileVariantWidths,
    })
    .from(campaignSlides)
    .where(and(eq(campaignSlides.id, id), eq(campaignSlides.active, true)))
    .limit(1);
  if (!slide) return new Response("Image not found", { status: 404 });

  // Fall back to the desktop image whenever no separate mobile crop was ever set, so slides
  // created before that feature existed keep working unchanged.
  const useMobile = wantsMobile && !!slide.mobileR2Key;
  const r2Key = useMobile ? slide.mobileR2Key! : slide.r2Key;
  const contentType = useMobile ? slide.mobileContentType! : slide.contentType;
  const variantWidths = useMobile ? slide.mobileVariantWidths : slide.variantWidths;

  if (Number.isFinite(requestedWidth) && requestedWidth > 0 && variantWidths?.length) {
    const width = nearestVariantWidth(requestedWidth, variantWidths);
    const variant = await getObjectBytes(variantKeyFor(r2Key, width));
    if (variant) {
      const response = new Response(Buffer.from(variant.body), {
        headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
      });
      await putEdgeCache(request, response.clone());
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
  await putEdgeCache(request, response.clone());
  return response;
}
